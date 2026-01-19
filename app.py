import os
import re
import csv
import json
import random
import smtplib
import time
from datetime import datetime, timedelta
from io import StringIO, TextIOWrapper
from threading import Thread
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, make_msgid

from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session, send_file
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# ==================== INITIALIZATION ====================

app = Flask(__name__)
app.secret_key = 'email-saas-secret-key-2024'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///emails.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB

# Constants
FREE_QUOTA = 10
PREMIUM_QUOTA = 1000
EMAIL_DELAY_MIN = 20
EMAIL_DELAY_MAX = 40

db = SQLAlchemy(app)

# ==================== DATABASE MODELS ====================

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(200))
    plan = db.Column(db.String(20), default='free')  # free, premium, pending
    is_active = db.Column(db.Boolean, default=True)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def get_daily_quota(self):
        today = datetime.now().date()
        quota = DailyQuota.query.filter_by(user_id=self.id, date=today).first()
        if not quota:
            quota = DailyQuota(user_id=self.id, date=today)
            db.session.add(quota)
            db.session.commit()
        return quota
    
    def can_send_email(self):
        quota = self.get_daily_quota()
        limit = FREE_QUOTA if self.plan == 'free' else PREMIUM_QUOTA
        return quota.sent_count < limit
    
    def get_remaining_quota(self):
        quota = self.get_daily_quota()
        limit = FREE_QUOTA if self.plan == 'free' else PREMIUM_QUOTA
        return max(0, limit - quota.sent_count)

class DailyQuota(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.Date, default=datetime.now().date)
    sent_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    
    __table_args__ = (db.UniqueConstraint('user_id', 'date', name='unique_user_date'),)

class Campaign(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='draft')  # draft, queued, sending, completed, paused
    subject = db.Column(db.String(200))
    body = db.Column(db.Text)
    total_recipients = db.Column(db.Integer, default=0)
    sent_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.now)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

class Recipient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey('campaign.id'), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100))
    company = db.Column(db.String(100))
    city = db.Column(db.String(100))
    status = db.Column(db.String(20), default='pending')  # pending, sent, failed
    sent_at = db.Column(db.DateTime)
    error = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)

class EmailLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    recipient = db.Column(db.String(100))
    subject = db.Column(db.String(200))
    status = db.Column(db.String(20))  # sent, failed
    error = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now)

class PremiumRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected
    reason = db.Column(db.Text)
    requested_at = db.Column(db.DateTime, default=datetime.now)
    processed_at = db.Column(db.DateTime)

# ==================== HELPER FUNCTIONS ====================

def get_current_user():
    if 'user_id' in session:
        return User.query.get(session['user_id'])
    return None

def login_required(f):
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please login first', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

def admin_required(f):
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        user = User.query.get(session['user_id'])
        if not user or not user.is_admin:
            flash('Admin access required', 'danger')
            return redirect(url_for('dashboard'))
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def parse_csv(file):
    """Parse CSV file without pandas"""
    try:
        # Try different encodings
        content = file.read().decode('utf-8')
        lines = content.strip().split('\n')
        
        # Parse CSV
        reader = csv.DictReader(StringIO(content))
        rows = list(reader)
        
        if not rows:
            return [], "CSV file is empty"
        
        # Check for required columns
        required = ['email']
        optional = ['name', 'company', 'city']
        
        for req in required:
            if req not in rows[0]:
                return [], f"Missing required column: {req}"
        
        # Process rows
        processed = []
        seen_emails = set()
        
        for row in rows:
            email = row.get('email', '').strip().lower()
            
            if not email:
                continue
            
            if not validate_email(email):
                continue
            
            if email in seen_emails:
                continue
            
            seen_emails.add(email)
            
            processed.append({
                'email': email,
                'name': row.get('name', '').strip(),
                'company': row.get('company', '').strip(),
                'city': row.get('city', '').strip()
            })
        
        return processed, f"Found {len(processed)} valid emails"
        
    except Exception as e:
        return [], f"Error parsing CSV: {str(e)}"

def send_email_smtp(to_email, subject, body, from_email, from_password, smtp_server='smtp.gmail.com', smtp_port=587):
    """Send email using SMTP"""
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = from_email
        msg['To'] = to_email
        msg['Date'] = datetime.now().strftime('%a, %d %b %Y %H:%M:%S %z')
        msg['Message-ID'] = make_msgid()
        
        # Add unsubscribe link
        unsubscribe_link = f"https://{request.host}/unsubscribe/{to_email}"
        full_body = f"{body}\n\n---\nTo unsubscribe from future emails, click here: {unsubscribe_link}"
        
        # Attach HTML part
        html_part = MIMEText(full_body, 'html')
        msg.attach(html_part)
        
        # Connect to SMTP server
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(from_email, from_password)
            server.send_message(msg)
        
        return True, None
    except Exception as e:
        return False, str(e)

def send_test_email():
    """Send test email to verify SMTP settings"""
    try:
        from_email = os.getenv('SMTP_EMAIL', '')
        password = os.getenv('SMTP_PASSWORD', '')
        
        if not from_email or not password:
            return False, "SMTP credentials not configured"
        
        msg = MIMEMultipart('alternative')
        msg['Subject'] = 'Test Email from Email SaaS'
        msg['From'] = from_email
        msg['To'] = from_email
        
        body = MIMEText('This is a test email from your Email SaaS application.', 'plain')
        msg.attach(body)
        
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(from_email, password)
            server.send_message(msg)
        
        return True, "Test email sent successfully"
    except Exception as e:
        return False, f"Failed to send test email: {str(e)}"

# ==================== ROUTES ====================

@app.route('/')
def index():
    if get_current_user():
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if get_current_user():
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        
        user = User.query.filter_by(email=email).first()
        
        if user and user.check_password(password):
            if not user.is_active:
                flash('Account is deactivated', 'danger')
                return redirect(url_for('login'))
            
            session['user_id'] = user.id
            flash('Login successful!', 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid email or password', 'danger')
    
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if get_current_user():
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')
        
        # Validation
        errors = []
        
        if len(username) < 3:
            errors.append('Username must be at least 3 characters')
        
        if not validate_email(email):
            errors.append('Invalid email address')
        
        if len(password) < 6:
            errors.append('Password must be at least 6 characters')
        
        if password != confirm:
            errors.append('Passwords do not match')
        
        # Check existing user
        if User.query.filter_by(email=email).first():
            errors.append('Email already registered')
        
        if User.query.filter_by(username=username).first():
            errors.append('Username already taken')
        
        if errors:
            for error in errors:
                flash(error, 'danger')
            return redirect(url_for('signup'))
        
        # Create user
        user = User(username=username, email=email, plan='free')
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        flash('Account created successfully! Please login.', 'success')
        return redirect(url_for('login'))
    
    return render_template('signup.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    flash('Logged out successfully', 'info')
    return redirect(url_for('index'))

@app.route('/dashboard')
@login_required
def dashboard():
    user = get_current_user()
    quota = user.get_daily_quota()
    
    # Get campaigns
    campaigns = Campaign.query.filter_by(user_id=user.id)\
        .order_by(Campaign.created_at.desc())\
        .limit(5)\
        .all()
    
    # Get recent email logs
    logs = EmailLog.query.filter_by(user_id=user.id)\
        .order_by(EmailLog.created_at.desc())\
        .limit(10)\
        .all()
    
    return render_template('dashboard.html',
                         user=user,
                         quota=quota,
                         campaigns=campaigns,
                         logs=logs,
                         FREE_QUOTA=FREE_QUOTA,
                         PREMIUM_QUOTA=PREMIUM_QUOTA)

@app.route('/upload', methods=['GET', 'POST'])
@login_required
def upload():
    user = get_current_user()
    
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file selected', 'danger')
            return redirect(url_for('upload'))
        
        file = request.files['file']
        if file.filename == '':
            flash('No file selected', 'danger')
            return redirect(url_for('upload'))
        
        if not file.filename.endswith('.csv'):
            flash('Only CSV files allowed', 'danger')
            return redirect(url_for('upload'))
        
        # Parse CSV
        rows, message = parse_csv(file)
        
        if not rows:
            flash(message, 'danger')
            return redirect(url_for('upload'))
        
        # Check quota
        if len(rows) > user.get_remaining_quota():
            flash(f'Only {user.get_remaining_quota()} emails remaining in quota', 'warning')
            rows = rows[:user.get_remaining_quota()]
        
        # Store in session for preview
        session['csv_data'] = rows
        session['campaign_name'] = request.form.get('campaign_name', 'My Campaign')
        
        flash(f'Successfully loaded {len(rows)} contacts', 'success')
        return redirect(url_for('preview'))
    
    return render_template('upload.html')

@app.route('/preview')
@login_required
def preview():
    if 'csv_data' not in session:
        flash('Please upload a CSV file first', 'warning')
        return redirect(url_for('upload'))
    
    data = session['csv_data'][:10]  # Show first 10 rows
    return render_template('preview.html',
                         data=data,
                         total=len(session['csv_data']),
                         campaign_name=session.get('campaign_name'))

@app.route('/compose', methods=['GET', 'POST'])
@login_required
def compose():
    user = get_current_user()
    
    if 'csv_data' not in session:
        flash('Please upload a CSV file first', 'warning')
        return redirect(url_for('upload'))
    
    if request.method == 'POST':
        # Create campaign
        campaign = Campaign(
            user_id=user.id,
            name=session.get('campaign_name', 'My Campaign'),
            subject=request.form.get('subject', ''),
            body=request.form.get('body', ''),
            total_recipients=len(session['csv_data'])
        )
        db.session.add(campaign)
        db.session.commit()
        
        # Add recipients
        for row in session['csv_data']:
            recipient = Recipient(
                campaign_id=campaign.id,
                email=row['email'],
                name=row.get('name', ''),
                company=row.get('company', ''),
                city=row.get('city', '')
            )
            db.session.add(recipient)
        
        db.session.commit()
        
        # Clear session
        session.pop('csv_data', None)
        session.pop('campaign_name', None)
        
        flash('Campaign created successfully!', 'success')
        return redirect(url_for('campaigns'))
    
    # Default template
    default_subject = "Hello {{name}} from {{company}}"
    default_body = """Hi {{name}},

I hope this email finds you well. I'm reaching out from {{company}} and noticed your work in {{city}}.

Would you be interested in learning more about our services?

Best regards,
{{user.username}}

---
To unsubscribe, click here: {{unsubscribe_link}}"""
    
    return render_template('compose.html',
                         default_subject=default_subject,
                         default_body=default_body)

@app.route('/campaigns')
@login_required
def campaigns():
    user = get_current_user()
    campaigns_list = Campaign.query.filter_by(user_id=user.id)\
        .order_by(Campaign.created_at.desc())\
        .all()
    return render_template('campaigns.html', campaigns=campaigns_list)

@app.route('/campaign/<int:id>')
@login_required
def campaign_detail(id):
    user = get_current_user()
    campaign = Campaign.query.get_or_404(id)
    
    if campaign.user_id != user.id and not user.is_admin:
        flash('Unauthorized', 'danger')
        return redirect(url_for('dashboard'))
    
    recipients = Recipient.query.filter_by(campaign_id=id).all()
    
    return render_template('campaign_detail.html',
                         campaign=campaign,
                         recipients=recipients)

@app.route('/campaign/<int:id>/start')
@login_required
def start_campaign(id):
    user = get_current_user()
    campaign = Campaign.query.get_or_404(id)
    
    if campaign.user_id != user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if not user.can_send_email():
        return jsonify({'error': 'Daily quota exceeded'}), 400
    
    # Update campaign status
    campaign.status = 'queued'
    campaign.started_at = datetime.now()
    db.session.commit()
    
    # Start sending in background
    def send_emails():
        with app.app_context():
            campaign.status = 'sending'
            db.session.commit()
            
            recipients = Recipient.query.filter_by(
                campaign_id=id,
                status='pending'
            ).all()
            
            smtp_email = os.getenv('SMTP_EMAIL', '')
            smtp_password = os.getenv('SMTP_PASSWORD', '')
            
            for recipient in recipients:
                try:
                    # Check quota
                    if not user.can_send_email():
                        campaign.status = 'paused'
                        db.session.commit()
                        break
                    
                    # Personalize email
                    subject = campaign.subject
                    body = campaign.body
                    
                    # Replace variables
                    vars_map = {
                        '{{name}}': recipient.name or '',
                        '{{email}}': recipient.email,
                        '{{company}}': recipient.company or '',
                        '{{city}}': recipient.city or '',
                        '{{user.username}}': user.username,
                        '{{unsubscribe_link}}': f'https://{request.host}/unsubscribe/{recipient.email}'
                    }
                    
                    for key, value in vars_map.items():
                        subject = subject.replace(key, value)
                        body = body.replace(key, value)
                    
                    # Send email (simulated or real)
                    if smtp_email and smtp_password:
                        success, error = send_email_smtp(
                            recipient.email,
                            subject,
                            body,
                            smtp_email,
                            smtp_password
                        )
                    else:
                        # Simulate sending for testing
                        time.sleep(0.1)  # Small delay for simulation
                        success = random.random() > 0.2  # 80% success rate
                        error = None if success else "Simulated failure"
                    
                    # Update records
                    if success:
                        recipient.status = 'sent'
                        recipient.sent_at = datetime.now()
                        campaign.sent_count += 1
                        
                        # Log
                        log = EmailLog(
                            user_id=user.id,
                            recipient=recipient.email,
                            subject=subject,
                            status='sent'
                        )
                        db.session.add(log)
                    else:
                        recipient.status = 'failed'
                        recipient.error = error
                        campaign.failed_count += 1
                        
                        # Log
                        log = EmailLog(
                            user_id=user.id,
                            recipient=recipient.email,
                            subject=subject,
                            status='failed',
                            error=error
                        )
                        db.session.add(log)
                    
                    # Update quota
                    quota = user.get_daily_quota()
                    if success:
                        quota.sent_count += 1
                    else:
                        quota.failed_count += 1
                    
                    db.session.commit()
                    
                    # Delay between emails
                    time.sleep(random.randint(EMAIL_DELAY_MIN, EMAIL_DELAY_MAX))
                    
                except Exception as e:
                    recipient.status = 'failed'
                    recipient.error = str(e)
                    campaign.failed_count += 1
                    db.session.commit()
            
            # Mark campaign as completed
            if campaign.status != 'paused':
                campaign.status = 'completed'
                campaign.completed_at = datetime.now()
                db.session.commit()
    
    Thread(target=send_emails).start()
    
    return jsonify({
        'success': True,
        'message': 'Campaign started',
        'campaign_id': id
    })

@app.route('/campaign/<int:id>/delete')
@login_required
def delete_campaign(id):
    user = get_current_user()
    campaign = Campaign.query.get_or_404(id)
    
    if campaign.user_id != user.id and not user.is_admin:
        flash('Unauthorized', 'danger')
        return redirect(url_for('campaigns'))
    
    # Delete recipients first
    Recipient.query.filter_by(campaign_id=id).delete()
    
    # Delete campaign
    db.session.delete(campaign)
    db.session.commit()
    
    flash('Campaign deleted successfully', 'success')
    return redirect(url_for('campaigns'))

# ==================== API ENDPOINTS ====================

@app.route('/api/stats')
@login_required
def api_stats():
    user = get_current_user()
    quota = user.get_daily_quota()
    limit = FREE_QUOTA if user.plan == 'free' else PREMIUM_QUOTA
    
    return jsonify({
        'plan': user.plan,
        'sent_today': quota.sent_count,
        'failed_today': quota.failed_count,
        'remaining': max(0, limit - quota.sent_count),
        'limit': limit,
        'usage_percent': round((quota.sent_count / limit) * 100, 1) if limit > 0 else 0
    })

@app.route('/api/history')
@login_required
def api_history():
    user = get_current_user()
    logs = EmailLog.query.filter_by(user_id=user.id)\
        .order_by(EmailLog.created_at.desc())\
        .limit(50)\
        .all()
    
    history = []
    for log in logs:
        history.append({
            'id': log.id,
            'recipient': log.recipient,
            'subject': log.subject[:50] + '...' if len(log.subject) > 50 else log.subject,
            'status': log.status,
            'error': log.error,
            'time': log.created_at.strftime('%Y-%m-%d %H:%M:%S')
        })
    
    return jsonify(history)

@app.route('/api/smtp')
@login_required
def api_smtp():
    """Check SMTP configuration status"""
    smtp_email = os.getenv('SMTP_EMAIL', '')
    smtp_password = os.getenv('SMTP_PASSWORD', '')
    
    if smtp_email and smtp_password:
        # Try to send test email
        success, message = send_test_email()
        return jsonify({
            'configured': True,
            'status': 'connected' if success else 'error',
            'email': smtp_email,
            'message': message
        })
    else:
        return jsonify({
            'configured': False,
            'status': 'not_configured',
            'message': 'SMTP not configured. Using simulation mode.'
        })

@app.route('/api/smtp/test', methods=['POST'])
@login_required
def test_smtp():
    """Test SMTP connection"""
    data = request.json
    email = data.get('email', '')
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password required'})
    
    try:
        # Save to environment temporarily
        os.environ['SMTP_EMAIL'] = email
        os.environ['SMTP_PASSWORD'] = password
        
        success, message = send_test_email()
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/smtp/save', methods=['POST'])
@login_required
def save_smtp():
    """Save SMTP credentials"""
    user = get_current_user()
    if not user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required'})
    
    data = request.json
    email = data.get('email', '')
    password = data.get('password', '')
    
    # In production, save to database or secure storage
    # For demo, we'll just set environment variables
    if email and password:
        os.environ['SMTP_EMAIL'] = email
        os.environ['SMTP_PASSWORD'] = password
        return jsonify({'success': True, 'message': 'SMTP credentials saved'})
    
    return jsonify({'success': False, 'message': 'Invalid credentials'})

# ==================== ADMIN ROUTES ====================

@app.route('/admin')
@admin_required
def admin_dashboard():
    user = get_current_user()
    
    stats = {
        'total_users': User.query.count(),
        'active_users': User.query.filter_by(is_active=True).count(),
        'premium_users': User.query.filter_by(plan='premium').count(),
        'total_campaigns': Campaign.query.count(),
        'today_emails': DailyQuota.query.filter_by(date=datetime.now().date())\
            .with_entities(db.func.sum(DailyQuota.sent_count)).scalar() or 0
    }
    
    pending_requests = PremiumRequest.query.filter_by(status='pending')\
        .order_by(PremiumRequest.requested_at.desc())\
        .all()
    
    recent_users = User.query.order_by(User.created_at.desc()).limit(10).all()
    
    return render_template('admin_dashboard.html',
                         stats=stats,
                         pending_requests=pending_requests,
                         recent_users=recent_users)

@app.route('/admin/users')
@admin_required
def admin_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return render_template('admin_users.html', users=users)

@app.route('/admin/user/<int:id>/toggle')
@admin_required
def toggle_user(id):
    user = User.query.get_or_404(id)
    user.is_active = not user.is_active
    db.session.commit()
    
    action = 'activated' if user.is_active else 'deactivated'
    flash(f'User {user.username} {action}', 'success')
    return redirect(url_for('admin_users'))

@app.route('/admin/user/<int:id>/make_admin')
@admin_required
def make_admin(id):
    user = User.query.get_or_404(id)
    user.is_admin = True
    db.session.commit()
    
    flash(f'User {user.username} is now an admin', 'success')
    return redirect(url_for('admin_users'))

@app.route('/admin/upgrade_requests')
@admin_required
def upgrade_requests():
    requests = PremiumRequest.query.order_by(PremiumRequest.requested_at.desc()).all()
    return render_template('upgrade_requests.html', requests=requests)

@app.route('/admin/approve/<int:id>')
@admin_required
def approve_upgrade(id):
    req = PremiumRequest.query.get_or_404(id)
    user = User.query.get(req.user_id)
    
    user.plan = 'premium'
    req.status = 'approved'
    req.processed_at = datetime.now()
    
    db.session.commit()
    
    flash(f'Premium access granted to {user.username}', 'success')
    return redirect(url_for('upgrade_requests'))

@app.route('/admin/reject/<int:id>')
@admin_required
def reject_upgrade(id):
    req = PremiumRequest.query.get_or_404(id)
    req.status = 'rejected'
    req.processed_at = datetime.now()
    
    db.session.commit()
    
    flash('Upgrade request rejected', 'info')
    return redirect(url_for('upgrade_requests'))

# ==================== USER UPGRADE ====================

@app.route('/upgrade', methods=['GET', 'POST'])
@login_required
def upgrade():
    user = get_current_user()
    
    if user.plan == 'premium':
        flash('You are already a premium user!', 'info')
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        reason = request.form.get('reason', '').strip()
        
        if len(reason) < 10:
            flash('Please provide a detailed reason (at least 10 characters)', 'danger')
            return redirect(url_for('upgrade'))
        
        # Check for existing request
        existing = PremiumRequest.query.filter_by(
            user_id=user.id,
            status='pending'
        ).first()
        
        if existing:
            flash('You already have a pending upgrade request', 'warning')
            return redirect(url_for('dashboard'))
        
        # Create request
        req = PremiumRequest(user_id=user.id, reason=reason)
        db.session.add(req)
        db.session.commit()
        
        flash('Upgrade request submitted! Admin will review it soon.', 'success')
        return redirect(url_for('dashboard'))
    
    return render_template('upgrade.html')

# ==================== SMTP SETTINGS ====================

@app.route('/smtp_settings')
@admin_required
def smtp_settings():
    smtp_email = os.getenv('SMTP_EMAIL', '')
    return render_template('smtp_settings.html', smtp_email=smtp_email)

# ==================== INITIALIZATION ====================

def init_db():
    """Initialize database with admin user"""
    with app.app_context():
        db.create_all()
        
        # Create admin user if not exists
        if not User.query.filter_by(email='admin@emailsaas.com').first():
            admin = User(
                username='admin',
                email='admin@emailsaas.com',
                plan='premium',
                is_admin=True
            )
            admin.set_password('admin123')
            db.session.add(admin)
            db.session.commit()
            print("✅ Admin user created: admin@emailsaas.com / admin123")
        
        # Create uploads directory
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        print("✅ Database initialized successfully")

# ==================== MAIN ====================

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Get network IP for Termux
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = "127.0.0.1"
    
    print("\n" + "="*50)
    print("📧 EMAIL OUTREACH SAAS - TERMUX EDITION")
    print("="*50)
    print(f"🌐 Local URL:    http://127.0.0.1:5000")
    print(f"📱 Network URL:  http://{local_ip}:5000")
    print(f"👤 Admin Login:  admin@emailsaas.com / admin123")
    print("="*50)
    print("🚀 Starting server...")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True
    )
