CREATE DATABASE IF NOT EXISTS shop_easy;
USE shop_easy;

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image VARCHAR(500),
    category VARCHAR(100),
    stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status ENUM('pending','paid','shipped','delivered','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending','completed','failed') DEFAULT 'pending',
    method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Seed users
INSERT INTO users (email, name) VALUES
    ('demo@shopeasy.com', 'Demo User'),
    ('john@example.com', 'John Smith');

-- Seed products with images
INSERT INTO products (name, description, price, image, category, stock) VALUES
    ('MacBook Pro 14"', 'Apple M3 Pro chip, 18GB RAM, 512GB SSD', 1999.99, 'https://placehold.co/300x300/1a1a2e/ffffff?text=MacBook+Pro', 'Electronics', 25),
    ('Sony WH-1000XM5', 'Industry-leading noise cancelling headphones', 349.99, 'https://placehold.co/300x300/16213e/ffffff?text=Sony+XM5', 'Electronics', 80),
    ('Mechanical Keyboard', 'Cherry MX Brown switches, RGB backlit', 129.99, 'https://placehold.co/300x300/0f3460/ffffff?text=Keyboard', 'Accessories', 150),
    ('4K Monitor 27"', 'IPS panel, 144Hz refresh rate, USB-C', 599.99, 'https://placehold.co/300x300/533483/ffffff?text=4K+Monitor', 'Electronics', 40),
    ('Wireless Mouse', 'Ergonomic design, 4000 DPI sensor', 59.99, 'https://placehold.co/300x300/e94560/ffffff?text=Mouse', 'Accessories', 200),
    ('USB-C Hub', '7-in-1 adapter with HDMI, SD card reader', 49.99, 'https://placehold.co/300x300/0f3460/ffffff?text=USB-C+Hub', 'Accessories', 300),
    ('Webcam HD 1080p', 'Auto-focus, built-in microphone, privacy cover', 79.99, 'https://placehold.co/300x300/1a1a2e/ffffff?text=Webcam', 'Electronics', 120),
    ('Standing Desk Mat', 'Anti-fatigue ergonomic comfort mat', 39.99, 'https://placehold.co/300x300/16213e/ffffff?text=Desk+Mat', 'Office', 250),
    ('Laptop Stand', 'Adjustable aluminum stand, heat dissipation', 44.99, 'https://placehold.co/300x300/533483/ffffff?text=Laptop+Stand', 'Accessories', 180),
    ('Noise Machine', 'White noise, nature sounds, sleep timer', 29.99, 'https://placehold.co/300x300/e94560/ffffff?text=Noise+Machine', 'Office', 90);
