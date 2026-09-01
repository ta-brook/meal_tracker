from flask import Flask, render_template
app = Flask(__name__, template_folder="../templates", static_folder="../static")
@app.get("/")
def home():
    return render_template("index.html")
