from flask import Flask, request, jsonify, render_template
import os, json, requests
from google.oauth2 import service_account
import google.auth.transport.requests as req

app = Flask(__name__)

# ------------------------
# ACCESS TOKEN GENERATOR
# ------------------------
def get_fcm_token():
    service_json = os.getenv("SERVICE_ACCOUNT_JSON")
    if not service_json:
        raise Exception("SERVICE_ACCOUNT_JSON ENV not set")

    creds_info = json.loads(service_json)

    creds = service_account.Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"]
    )

    auth_req = req.Request()
    creds.refresh(auth_req)
    return creds.token


# ------------------------
# SEND PUSH NOTIFICATION
# ------------------------
@app.route("/send", methods=["POST"])
def send_notification():
    try:
        data = request.get_json()
        user_token = data.get("token")
        title = data.get("title", "FCM Title")
        body = data.get("body", "FCM Body")

        # OAuth
        access_token = get_fcm_token()

        # Replace with your project ID
        project_id = "daily-campaign-king"
        url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

        # Payload
        payload = {
            "message": {
                "notification": {
                    "title": title,
                    "body": body
                }
            }
        }

        # Token or Topic
        if user_token.startswith("/topics/"):
            payload["message"]["topic"] = user_token.replace("/topics/", "")
        else:
            payload["message"]["token"] = user_token

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        response = requests.post(url, headers=headers, json=payload)

        return jsonify({
            "status": response.status_code,
            "firebase_response": response.json()
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------
# HOME ROUTE (TEST PAGE)
# ------------------------
@app.route("/")
def home():
    return render_template("index.html")


# ------------------------
# MAIN
# ------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
