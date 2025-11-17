from flask import Flask, request, jsonify
import json
import requests
from google.oauth2 import service_account
import google.auth.transport.requests as req

app = Flask(__name__)

# Load Firebase service account
CREDENTIALS = "service-account.json"

def get_access_token():
    """Generate Firebase OAuth access token"""
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"]
    )
    auth_req = req.Request()
    creds.refresh(auth_req)
    return creds.token


@app.route("/send", methods=["POST"])
def send_notification():
    try:
        body = request.get_json()

        device_token = body.get("token")
        title = body.get("title", "Default Title")
        message_body = body.get("body", "Default Message")

        # Create OAuth Token
        token = get_access_token()

        # Replace with your project ID
        project_id = "daily-campaign-king"
        url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

        data = {
            "message": {
                "token": device_token,
                "notification": {
                    "title": title,
                    "body": message_body
                }
            }
        }

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; UTF-8"
        }

        response = requests.post(url, headers=headers, json=data)

        return jsonify({
            "status": response.status_code,
            "response": response.json()
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/")
def home():
    return "🔥 FCM Flask API Running!"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
  
