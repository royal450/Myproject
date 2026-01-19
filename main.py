from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import csv
import json
import os
import re

app = Flask(__name__)
CORS(app)

# In-memory storage (for demo)
emails_sent = []
smtp_accounts = []
templates = []
user_stats = {
    'plan': 'free',
    'emails_today': 0,
    'total_emails': 0,
    'last_reset': datetime.now().date()
}

# Constants
FREE_DAILY_LIMIT = 10
PAID_DAILY_LIMIT = 100

def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def can_send_email():
    # Reset daily counter if new day
    if user_stats['last_reset'] < datetime.now().date():
        user_stats['emails_today'] = 0
        user_stats['last_reset'] = datetime.now().date()
    
    limit = PAID_DAILY_LIMIT if user_stats['plan'] == 'paid' else FREE_DAILY_LIMIT
    return user_stats['emails_today'] < limit

def send_single_email(smtp_config, to_email, subject, body, html_body=None):
    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = smtp_config['email']
        message["To"] = to_email
        
        message.attach(MIMEText(body, "plain"))
        
        if html_body:
            message.attach(MIMEText(html_body, "html"))
        
        context = ssl.create_default_context()
        
        with smtplib.SMTP(smtp_config['smtp_server'], smtp_config['smtp_port']) as server:
            server.starttls(context=context)
            server.login(smtp_config['email'], smtp_config['password'])
            server.send_message(message)
        
        return True, "Email sent successfully"
    
    except Exception as e:
        return False, str(e)

@app.route('/')
def home():
    return jsonify({
        "message": "Email Marketing Tool API",
        "version": "1.0",
        "status": "running"
    })

@app.route('/stats', methods=['GET'])
def get_stats():
    limit = PAID_DAILY_LIMIT if user_stats['plan'] == 'paid' else FREE_DAILY_LIMIT
    remaining = limit - user_stats['emails_today']
    
    success_emails = [e for e in emails_sent if e.get('status') == 'success']
    failed_emails = [e for e in emails_sent if e.get('status') == 'failed']
    
    return jsonify({
        "user_stats": {
            "plan": user_stats['plan'],
            "emails_today": user_stats['emails_today'],
            "total_emails": user_stats['total_emails'],
            "daily_limit": limit,
            "remaining_today": remaining
        },
        "email_stats": {
            "total_sent": len(emails_sent),
            "total_success": len(success_emails),
            "total_failed": len(failed_emails),
            "success_rate": (len(success_emails) / len(emails_sent) * 100) if emails_sent else 0
        },
        "smtp_accounts": len(smtp_accounts),
        "templates": len(templates)
    })

@app.route('/send', methods=['POST'])
def send_email():
    data = request.json
    
    # Check required fields
    required = ['to_email', 'subject', 'body', 'smtp_account_id']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "message": f"Missing {field}"}), 400
    
    # Validate email
    if not validate_email(data['to_email']):
        return jsonify({"success": False, "message": "Invalid email address"}), 400
    
    # Check daily limit
    if not can_send_email():
        return jsonify({
            "success": False,
            "message": f"Daily limit reached ({user_stats['emails_today']}/{FREE_DAILY_LIMIT})"
        }), 400
    
    # Find SMTP account
    smtp_account = None
    for acc in smtp_accounts:
        if acc['id'] == data['smtp_account_id']:
            smtp_account = acc
            break
    
    if not smtp_account:
        return jsonify({"success": False, "message": "SMTP account not found"}), 404
    
    # Send email
    success, message = send_single_email(
        smtp_account,
        data['to_email'],
        data['subject'],
        data['body'],
        data.get('html_body')
    )
    
    # Update stats
    user_stats['emails_today'] += 1
    user_stats['total_emails'] += 1
    
    # Save to history
    email_record = {
        'id': len(emails_sent) + 1,
        'to_email': data['to_email'],
        'subject': data['subject'],
        'status': 'success' if success else 'failed',
        'error': None if success else message,
        'sent_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'opened': False
    }
    emails_sent.append(email_record)
    
    return jsonify({
        "success": success,
        "message": message,
        "email_id": email_record['id']
    })

@app.route('/send/bulk', methods=['POST'])
def send_bulk():
    if 'csv_file' not in request.files:
        return jsonify({"success": False, "message": "No CSV file"}), 400
    
    file = request.files['csv_file']
    smtp_account_id = request.form.get('smtp_account_id')
    
    if not smtp_account_id:
        return jsonify({"success": False, "message": "SMTP account ID required"}), 400
    
    # Find SMTP account
    smtp_account = None
    for acc in smtp_accounts:
        if acc['id'] == int(smtp_account_id):
            smtp_account = acc
            break
    
    if not smtp_account:
        return jsonify({"success": False, "message": "SMTP account not found"}), 404
    
    # Read CSV
    csv_data = file.read().decode('utf-8').splitlines()
    reader = csv.DictReader(csv_data)
    
    results = []
    total_sent = 0
    
    for row in reader:
        if not can_send_email():
            results.append({
                'email': row.get('email', ''),
                'status': 'failed',
                'message': 'Daily limit reached'
            })
            continue
        
        if 'email' not in row or 'subject' not in row:
            results.append({
                'email': row.get('email', ''),
                'status': 'failed',
                'message': 'Missing required fields'
            })
            continue
        
        success, message = send_single_email(
            smtp_account,
            row['email'],
            row['subject'],
            row.get('body', ''),
            row.get('html_body')
        )
        
        # Update stats
        user_stats['emails_today'] += 1
        user_stats['total_emails'] += 1
        total_sent += 1
        
        # Save record
        emails_sent.append({
            'id': len(emails_sent) + 1,
            'to_email': row['email'],
            'subject': row['subject'],
            'status': 'success' if success else 'failed',
            'error': None if success else message,
            'sent_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'opened': False
        })
        
        results.append({
            'email': row['email'],
            'status': 'success' if success else 'failed',
            'message': message
        })
    
    return jsonify({
        "success": True,
        "message": f"Sent {total_sent} emails",
        "results": results
    })

@app.route('/smtp', methods=['GET'])
def get_smtp():
    return jsonify({"accounts": smtp_accounts})

@app.route('/smtp', methods=['POST'])
def add_smtp():
    data = request.json
    
    required = ['email', 'password', 'smtp_server', 'smtp_port']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "message": f"Missing {field}"}), 400
    
    new_account = {
        'id': len(smtp_accounts) + 1,
        'email': data['email'],
        'password': data['password'],
        'smtp_server': data['smtp_server'],
        'smtp_port': int(data['smtp_port']),
        'daily_limit': data.get('daily_limit', 500),
        'emails_sent_today': 0,
        'is_active': True
    }
    
    smtp_accounts.append(new_account)
    
    return jsonify({
        "success": True,
        "message": "SMTP account added",
        "account_id": new_account['id']
    })

@app.route('/smtp/test/<int:account_id>', methods=['POST'])
def test_smtp(account_id):
    # Find account
    smtp_account = None
    for acc in smtp_accounts:
        if acc['id'] == account_id:
            smtp_account = acc
            break
    
    if not smtp_account:
        return jsonify({"success": False, "message": "SMTP account not found"}), 404
    
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

@app.route('/templates', methods=['GET'])
def get_templates():
    return jsonify({"templates": templates})

@app.route('/templates', methods=['POST'])
def add_template():
    data = request.json
    
    if 'name' not in data or 'subject' not in data or 'body' not in data:
        return jsonify({"success": False, "message": "Missing required fields"}), 400
    
    new_template = {
        'id': len(templates) + 1,
        'name': data['name'],
        'subject': data['subject'],
        'body': data['body'],
        'html_body': data.get('html_body', ''),
        'variables': data.get('variables', []),
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    templates.append(new_template)
    
    return jsonify({
        "success": True,
        "message": "Template added",
        "template_id": new_template['id']
    })

@app.route('/history', methods=['GET'])
def get_history():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    
    start = (page - 1) * per_page
    end = start + per_page
    
    paginated = emails_sent[start:end]
    
    return jsonify({
        "history": paginated,
        "page": page,
        "per_page": per_page,
        "total": len(emails_sent)
    })

@app.route('/upgrade', methods=['POST'])
def upgrade():
    user_stats['plan'] = 'paid'
    
    return jsonify({
        "success": True,
        "message": "Upgraded to paid plan",
        "plan": "paid",
        "daily_limit": PAID_DAILY_LIMIT
    })

@app.route('/track/open/<int:email_id>', methods=['GET'])
def track_open(email_id):
    for email in emails_sent:
        if email['id'] == email_id:
            email['opened'] = True
            email['opened_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            break
    
    # Return tracking pixel
    from flask import Response
    pixel = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    return Response(pixel, mimetype='image/gif')

# For Vercel deployment
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
