from app.pos_app import create_pos_app

app = create_pos_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
