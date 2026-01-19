from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import csv
import json
import re
import os

# Initialize Flask app
app = Flask(__name__, static_folder='templates')
CORS(app)  # Allow all origins

# Simple in-memory storage
emails_history = []
smtp_accounts = []
email_templates = []

# User stats
user_stats = {
    "plan": "free",  # free or paid
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
    # Reset counter if new day
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
def serve_index():
    """Serve the frontend HTML"""
    return send_from_directory('templates', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from templates folder"""
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
            "/api/send/bulk": "POST - Send bulk emails",
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

@app.route('/api/send/bulk', methods=['POST'])
def send_bulk():
    """Send bulk emails from CSV"""
    if 'csv_file' not in request.files:
        return jsonify({
            "success": False,
            "message": "No CSV file uploaded"
        }), 400
    
    file = request.files['csv_file']
    smtp_account_id = request.form.get('smtp_account_id', type=int)
    campaign_name = request.form.get('campaign_name', 'Bulk Campaign')
    
    if not smtp_account_id:
        return jsonify({
            "success": False,
            "message": "SMTP account ID required"
        }), 400
    
    # Find SMTP account
    smtp_account = None
    for acc in smtp_accounts:
        if acc['id'] == smtp_account_id:
            smtp_account = acc
            break
    
    if not smtp_account:
        return jsonify({
            "success": False,
            "message": "SMTP account not found"
        }), 404
    
    # Read CSV
    csv_data = file.read().decode('utf-8').splitlines()
    reader = csv.DictReader(csv_data)
    
    results = []
    emails_to_send = []
    
    # First, collect all emails
    for row in reader:
        if 'email' not in row or 'subject' not in row:
            continue
        
        emails_to_send.append({
            'email': row['email'],
            'subject': row['subject'],
            'body': row.get('body', ''),
            'html_body': row.get('html_body')
        })
    
    # Check if we can send all emails
    if user_stats["emails_today"] + len(emails_to_send) > (PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT):
        return jsonify({
            "success": False,
            "message": f"Cannot send {len(emails_to_send)} emails. Daily limit would be exceeded."
        }), 400
    
    # Send emails
    for email_data in emails_to_send:
        if not can_send_email():
            results.append({
                "email": email_data['email'],
                "status": "failed",
                "message": "Daily limit reached during sending"
            })
            continue
        
        success, message = send_email_smtp(
            smtp_account,
            email_data['email'],
            email_data['subject'],
            email_data['body'],
            email_data.get('html_body')
        )
        
        # Update stats
        user_stats["emails_today"] += 1
        user_stats["total_emails"] += 1
        
        # Save to history
        emails_history.append({
            "id": len(emails_history) + 1,
            "to_email": email_data['email'],
            "subject": email_data['subject'],
            "status": "success" if success else "failed",
            "message": message,
            "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "campaign": campaign_name,
            "opened": False
        })
        
        results.append({
            "email": email_data['email'],
            "status": "success" if success else "failed",
            "message": message
        })
    
    return jsonify({
        "success": True,
        "message": f"Processed {len(results)} emails",
        "campaign": campaign_name,
        "results": results
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

@app.route('/api/templates', methods=['GET'])
def get_templates():
    """Get all email templates"""
    return jsonify({
        "success": True,
        "templates": email_templates
    })

@app.route('/api/templates', methods=['POST'])
def add_template():
    """Add new email template"""
    data = request.json
    
    if 'name' not in data or 'subject' not in data or 'body' not in data:
        return jsonify({
            "success": False,
            "message": "Missing required fields: name, subject, body"
        }), 400
    
    # Create new template
    new_template = {
        "id": len(email_templates) + 1,
        "name": data['name'],
        "subject": data['subject'],
        "body": data['body'],
        "html_body": data.get('html_body', ''),
        "variables": data.get('variables', []),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    email_templates.append(new_template)
    
    return jsonify({
        "success": True,
        "message": "Template added successfully",
        "template_id": new_template["id"],
        "template": new_template
    })

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get email history"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    # Simple pagination
    start = (page - 1) * per_page
    end = start + per_page
    
    history_page = emails_history[start:end]
    
    return jsonify({
        "success": True,
        "history": history_page,
        "page": page,
        "per_page": per_page,
        "total": len(emails_history),
        "total_pages": (len(emails_history) + per_page - 1) // per_page
    })

@app.route('/api/upgrade', methods=['POST'])
def upgrade_plan():
    """Upgrade to paid plan"""
    data = request.json
    
    # Simple upgrade - no payment verification
    user_stats["plan"] = "paid"
    
    return jsonify({
        "success": True,
        "message": "Upgraded to paid plan successfully!",
        "plan": "paid",
        "daily_limit": PAID_LIMIT,
        "new_limit": "100 emails per day"
    })

@app.route('/api/track/open/<int:email_id>', methods=['GET'])
def track_email_open(email_id):
    """Track email opens"""
    for email in emails_history:
        if email["id"] == email_id:
            email["opened"] = True
            email["opened_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            break
    
    # Return 1x1 transparent pixel
    from flask import Response
    pixel = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
    return Response(pixel, mimetype='image/gif')

# ========== RUN APP ==========

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"""
    📧 Email Marketing Tool
    {'='*40}
    Local: http://127.0.0.1:{port}
    API: http://127.0.0.1:{port}/api/
    Frontend: http://127.0.0.1:{port}/
    {'='*40}
    """)
    app.run(host='0.0.0.0', port=port, debug=True)
