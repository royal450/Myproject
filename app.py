from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import json
import re
import os
import smtplib
import ssl
import csv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from io import StringIO

# Initialize Flask app
app = Flask(__name__)
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
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def can_send_email():
    today = datetime.now().strftime("%Y-%m-%d")
    if user_stats["last_reset"] != today:
        user_stats["emails_today"] = 0
        user_stats["last_reset"] = today
    
    limit = PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT
    return user_stats["emails_today"] < limit

def send_email_smtp(smtp_config, to_email, subject, body, html_body=None):
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_config['email']
        msg['To'] = to_email
        
        msg.attach(MIMEText(body, 'plain'))
        
        if html_body:
            msg.attach(MIMEText(html_body, 'html'))
        
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
    return jsonify({
        "app": "Email Marketing Tool",
        "version": "1.0",
        "status": "running",
        "features": [
            "Send single emails",
            "Send bulk emails via CSV",
            "Manage SMTP accounts",
            "Email templates",
            "Track opens",
            "Free: 10 emails/day",
            "Pro: 100 emails/day ($99/month)"
        ]
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    limit = PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT
    remaining = limit - user_stats["emails_today"]
    
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
            "successful": success_count
        }
    })

@app.route('/api/send', methods=['POST'])
def send_email():
    data = request.json
    
    required = ['to_email', 'subject', 'body', 'smtp_account_id']
    for field in required:
        if field not in data:
            return jsonify({
                "success": False,
                "message": f"Missing field: {field}"
            }), 400
    
    if not validate_email(data['to_email']):
        return jsonify({
            "success": False,
            "message": "Invalid email address"
        }), 400
    
    if not can_send_email():
        return jsonify({
            "success": False,
            "message": f"Daily limit reached! ({user_stats['emails_today']}/{FREE_LIMIT})"
        }), 400
    
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
    
    success, message = send_email_smtp(
        smtp_account,
        data['to_email'],
        data['subject'],
        data['body'],
        data.get('html_body')
    )
    
    user_stats["emails_today"] += 1
    user_stats["total_emails"] += 1
    
    email_record = {
        "id": len(emails_history) + 1,
        "to_email": data['to_email'],
        "subject": data['subject'],
        "status": "success" if success else "failed",
        "message": message,
        "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    emails_history.append(email_record)
    
    return jsonify({
        "success": success,
        "message": message,
        "email_id": email_record["id"]
    })

@app.route('/api/send/bulk', methods=['POST'])
def send_bulk():
    if 'csv_file' not in request.files:
        return jsonify({
            "success": False,
            "message": "No CSV file uploaded"
        }), 400
    
    file = request.files['csv_file']
    smtp_account_id = request.form.get('smtp_account_id', type=int)
    
    if not smtp_account_id:
        return jsonify({
            "success": False,
            "message": "SMTP account ID required"
        }), 400
    
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
    csv_content = file.read().decode('utf-8')
    csv_reader = csv.DictReader(StringIO(csv_content))
    
    emails_to_send = []
    for row in csv_reader:
        if 'email' in row and 'subject' in row:
            emails_to_send.append({
                'email': row['email'],
                'subject': row['subject'],
                'body': row.get('body', ''),
                'html_body': row.get('html_body')
            })
    
    if user_stats["emails_today"] + len(emails_to_send) > (PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT):
        return jsonify({
            "success": False,
            "message": f"Cannot send {len(emails_to_send)} emails. Daily limit would be exceeded."
        }), 400
    
    results = []
    for email_data in emails_to_send:
        if not can_send_email():
            results.append({
                "email": email_data['email'],
                "status": "failed",
                "message": "Daily limit reached"
            })
            continue
        
        success, message = send_email_smtp(
            smtp_account,
            email_data['email'],
            email_data['subject'],
            email_data['body'],
            email_data.get('html_body')
        )
        
        user_stats["emails_today"] += 1
        user_stats["total_emails"] += 1
        
        emails_history.append({
            "id": len(emails_history) + 1,
            "to_email": email_data['email'],
            "subject": email_data['subject'],
            "status": "success" if success else "failed",
            "message": message,
            "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        
        results.append({
            "email": email_data['email'],
            "status": "success" if success else "failed",
            "message": message
        })
    
    return jsonify({
        "success": True,
        "message": f"Sent {len([r for r in results if r['status'] == 'success'])} emails",
        "results": results
    })

@app.route('/api/smtp', methods=['GET'])
def get_smtp_accounts():
    return jsonify({
        "success": True,
        "accounts": smtp_accounts
    })

@app.route('/api/smtp', methods=['POST'])
def add_smtp_account():
    data = request.json
    
    required = ['email', 'password', 'smtp_server', 'smtp_port']
    for field in required:
        if field not in data:
            return jsonify({
                "success": False,
                "message": f"Missing field: {field}"
            }), 400
    
    new_account = {
        "id": len(smtp_accounts) + 1,
        "email": data['email'],
        "password": data['password'],
        "smtp_server": data['smtp_server'],
        "smtp_port": int(data['smtp_port'])
    }
    
    smtp_accounts.append(new_account)
    
    return jsonify({
        "success": True,
        "message": "SMTP account added",
        "account_id": new_account["id"]
    })

@app.route('/api/history', methods=['GET'])
def get_history():
    return jsonify({
        "success": True,
        "history": emails_history[-20:],
        "total": len(emails_history)
    })

@app.route('/api/upgrade', methods=['POST'])
def upgrade_plan():
    user_stats["plan"] = "paid"
    
    return jsonify({
        "success": True,
        "message": "Upgraded to paid plan!",
        "plan": "paid",
        "daily_limit": PAID_LIMIT
    })

# ========== RUN APP ==========

if __name__ == '__main__':
    # Render automatically sets PORT environment variable
    # We don't need to specify port
    print("🚀 Email Marketing Tool API Started")
    print("📧 Ready to send emails!")
    app.run(host='0.0.0.0')  # No port specified
