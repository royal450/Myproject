from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import json
import re
import os

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Simple in-memory storage
emails_history = []
smtp_accounts = []

# User stats
user_stats = {
    "plan": "free",
    "emails_today": 0,
    "total_emails": 0
}

# Constants
FREE_LIMIT = 10
PAID_LIMIT = 100

@app.route('/')
def home():
    return jsonify({
        "app": "Email Marketing Tool",
        "status": "running",
        "message": "API is working!"
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    limit = PAID_LIMIT if user_stats["plan"] == "paid" else FREE_LIMIT
    remaining = limit - user_stats["emails_today"]
    
    return jsonify({
        "success": True,
        "plan": user_stats["plan"],
        "emails_today": user_stats["emails_today"],
        "total_emails": user_stats["total_emails"],
        "daily_limit": limit,
        "remaining_today": remaining
    })

@app.route('/api/send', methods=['POST'])
def send_email():
    data = request.json
    
    # Simulate email sending
    user_stats["emails_today"] += 1
    user_stats["total_emails"] += 1
    
    # Save to history
    emails_history.append({
        "id": len(emails_history) + 1,
        "to_email": data.get('to_email', 'test@example.com'),
        "subject": data.get('subject', 'Test'),
        "status": "success",
        "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    
    return jsonify({
        "success": True,
        "message": "Email sent (simulated)",
        "email_id": len(emails_history)
    })

@app.route('/api/smtp', methods=['GET'])
def get_smtp():
    return jsonify({
        "success": True,
        "accounts": smtp_accounts
    })

@app.route('/api/smtp', methods=['POST'])
def add_smtp():
    data = request.json
    
    new_account = {
        "id": len(smtp_accounts) + 1,
        "email": data.get('email', 'test@example.com'),
        "server": data.get('smtp_server', 'smtp.gmail.com'),
        "port": data.get('smtp_port', 587),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    smtp_accounts.append(new_account)
    
    return jsonify({
        "success": True,
        "message": "SMTP account added",
        "account_id": new_account["id"]
    })

@app.route('/api/upgrade', methods=['POST'])
def upgrade():
    user_stats["plan"] = "paid"
    
    return jsonify({
        "success": True,
        "message": "Upgraded to paid plan!",
        "plan": "paid",
        "daily_limit": PAID_LIMIT
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Server running on port {port}")
    app.run(host='0.0.0.0', port=port)
