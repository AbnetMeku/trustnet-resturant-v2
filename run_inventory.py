from app.inventory_app import create_inventory_app

app = create_inventory_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
