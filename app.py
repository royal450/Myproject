from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import json
import re
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Initialize Flask app
app = Flask(__name__, static_folder='templates')
CORS(app)

# Simple in-memory storage
emails_history = []
smtp_accounts = []
email_templates = []

# User stats
user_stats = {
    "plan": "free",
    "emails_today": 0,
    "total_emails": 0,
    "last_reset": datetime.now().strftime("%Y-%m-%d")
}

# Constants
FREE_LIMIT = 10
PAID_LIMIT = 100

def validate_email(email):
    """Check if email is valid"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def can_send_email():
    """Check if user can send more emails today"""
    today = datetime.now().strftime("%Y-%m-%d")
    if user_stats["last_reset"] != today:
        user_stats["emails_today"] = 0
        user_stats["last_reset"] = today
    
    limit = PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT
    return user_stats["emails_today"] < limit

def send_email_smtp(smtp_config, to_email, subject, body, html_body=None):
    """Send email using SMTP"""
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_config['email']
        msg['To'] = to_email
        
        # Plain text version
        msg.attach(MIMEText(body, 'plain'))
        
        # HTML version if provided
        if html_body:
            msg.attach(MIMEText(html_body, 'html'))
        
        # Connect to SMTP server
        context = ssl.create_default_context()
        with smtplib.SMTP(smtp_config['smtp_server'], smtp_config['smtp_port']) as server:
            server.starttls(context=context)
            server.login(smtp_config['email'], smtp_config['password'])
            server.send_message(msg)
        
        return True, "Email sent successfully"
        
    except Exception as e:
        return False, str(e)

# ========== ROUTES ==========

@app.route('/')
def home():
    """Serve the frontend HTML"""
    return send_from_directory('templates', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('templates', path)

@app.route('/api/')
def api_info():
    """API information"""
    return jsonify({
        "app": "Email Marketing Tool",
        "version": "1.0",
        "status": "running",
        "author": "Termux User",
        "endpoints": {
            "/api/stats": "GET - Get statistics",
            "/api/send": "POST - Send single email",
            "/api/smtp": "GET/POST - SMTP accounts",
            "/api/templates": "GET/POST - Email templates",
            "/api/history": "GET - Email history",
            "/api/upgrade": "POST - Upgrade to paid plan"
        }
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get user statistics"""
    limit = PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT
    remaining = limit - user_stats["emails_today"]
    
    # Calculate success rate
    success_count = sum(1 for e in emails_history if e.get("status") == "success")
    total_count = len(emails_history)
    success_rate = (success_count / total_count * 100) if total_count > 0 else 0
    
    return jsonify({
        "success": True,
        "stats": {
            "plan": user_stats["plan"],
            "emails_today": user_stats["emails_today"],
            "total_emails": user_stats["total_emails"],
            "daily_limit": limit,
            "remaining_today": remaining,
            "success_rate": round(success_rate, 1)
        },
        "counts": {
            "smtp_accounts": len(smtp_accounts),
            "templates": len(email_templates),
            "total_sent": total_count,
            "successful": success_count,
            "failed": total_count - success_count
        }
    })

@app.route('/api/send', methods=['POST'])
def send_email():
    """Send single email"""
    data = request.json
    
    # Check required fields
    required = ['to_email', 'subject', 'body', 'smtp_account_id']
    for field in required:
        if field not in data:
            return jsonify({
                "success": False,
                "message": f"Missing field: {field}"
            }), 400
    
    # Validate email
    if not validate_email(data['to_email']):
        return jsonify({
            "success": False,
            "message": "Invalid email address"
        }), 400
    
    # Check daily limit
    if not can_send_email():
        return jsonify({
            "success": False,
            "message": f"Daily limit reached! ({user_stats['emails_today']}/{FREE_LIMIT})"
        }), 400
    
    # Find SMTP account
    smtp_account = None
    for acc in smtp_accounts:
        if acc['id'] == data['smtp_account_id']:
            smtp_account = acc
            break
    
    if not smtp_account:
        return jsonify({
            "success": False,
            "message": "SMTP account not found"
        }), 404
    
    # Send email
    success, message = send_email_smtp(
        smtp_account,
        data['to_email'],
        data['subject'],
        data['body'],
        data.get('html_body')
    )
    
    # Update stats
    user_stats["emails_today"] += 1
    user_stats["total_emails"] += 1
    
    # Save to history
    email_record = {
        "id": len(emails_history) + 1,
        "to_email": data['to_email'],
        "subject": data['subject'],
        "status": "success" if success else "failed",
        "message": message,
        "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "opened": False,
        "smtp_account": smtp_account['email']
    }
    emails_history.append(email_record)
    
    return jsonify({
        "success": success,
        "message": message,
        "email_id": email_record["id"]
    })

@app.route('/api/smtp', methods=['GET'])
def get_smtp_accounts():
    """Get all SMTP accounts"""
    return jsonify({
        "success": True,
        "accounts": smtp_accounts
    })

@app.route('/api/smtp', methods=['POST'])
def add_smtp_account():
    """Add new SMTP account"""
    data = request.json
    
    required = ['email', 'password', 'smtp_server', 'smtp_port']
    for field in required:
        if field not in data:
            return jsonify({
                "success": False,
                "message": f"Missing field: {field}"
            }), 400
    
    # Create new account
    new_account = {
        "id": len(smtp_accounts) + 1,
        "email": data['email'],
        "password": data['password'],
        "smtp_server": data['smtp_server'],
        "smtp_port": int(data['smtp_port']),
        "daily_limit": data.get('daily_limit', 500),
        "is_active": True,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    smtp_accounts.append(new_account)
    
    return jsonify({
        "success": True,
        "message": "SMTP account added successfully",
        "account_id": new_account["id"],
        "account": new_account
    })

@app.route('/api/smtp/test/<int:account_id>', methods=['POST'])
def test_smtp_account(account_id):
    """Test SMTP connection"""
    # Find account
    smtp_account = None
    for acc in smtp_accounts:
        if acc['id'] == account_id:
            smtp_account = acc
            break
    
    if not smtp_account:
        return jsonify({
            "success": False,
            "message": "SMTP account not found"
        }), 404
    
    try:
        # Test connection
        context = ssl.create_default_context()
        with smtplib.SMTP(smtp_account['smtp_server'], smtp_account['smtp_port']) as server:
            server.starttls(context=context)
            server.login(smtp_account['email'], smtp_account['password'])
        
        return jsonify({
            "success": True,
            "message": "SMTP connection successful"
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"SMTP connection failed: {str(e)}"
        })

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get email history"""
    return jsonify({
        "success": True,
        "history": emails_history[-50:],  # Last 50 emails
        "total": len(emails_history)
    })

@app.route('/api/upgrade', methods=['POST'])
def upgrade_plan():
    """Upgrade to paid plan"""
    user_stats["plan"] = "paid"
    
    return jsonify({
        "success": True,
        "message": "Upgraded to paid plan successfully!",
        "plan": "paid",
        "daily_limit": PAID_LIMIT
    })

# ========== RUN APP ==========

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"""
    📧 Email Marketing Tool
    {'='*40}
    Running on port: {port}
    {'='*40}
    """)
    app.run(host='0.0.0.0', port=port)
