CREATE DATABASE IF NOT EXISTS shop_easy;
USE shop_easy;

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image VARCHAR(500),
    category VARCHAR(100),
    stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    shipping_name VARCHAR(255),
    shipping_email VARCHAR(255),
    shipping_address TEXT,
    status ENUM('pending','paid','shipped','delivered','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add shipping columns if table already exists (idempotent)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='shop_easy' AND TABLE_NAME='orders' AND COLUMN_NAME='shipping_name');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE orders ADD COLUMN shipping_name VARCHAR(255), ADD COLUMN shipping_email VARCHAR(255), ADD COLUMN shipping_address TEXT', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending','completed','failed') DEFAULT 'pending',
    method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Seed data (ignore if already exists)
INSERT IGNORE INTO users (id, email, name) VALUES
    (1, 'demo@shopeasy.com', 'Demo User');

INSERT INTO products (id, name, description, price, image, category, stock) VALUES
    (1, 'MacBook Pro 14"', 'Apple M3 Pro chip, 18GB RAM, 512GB SSD', 1999.99, 'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/thumbnail.webp', 'Electronics', 25),
    (2, 'Sony WH-1000XM5', 'Industry-leading noise cancelling headphones', 349.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp', 'Electronics', 80),
    (3, 'Mechanical Keyboard', 'Cherry MX Brown switches, RGB backlit', 129.99, 'https://cdn.dummyjson.com/product-images/laptops/asus-zenbook-pro-dual-screen-laptop/thumbnail.webp', 'Accessories', 150),
    (4, '4K Monitor 27"', 'IPS panel, 144Hz refresh rate, USB-C', 599.99, 'https://cdn.dummyjson.com/product-images/laptops/new-dell-xps-13-9300-laptop/thumbnail.webp', 'Electronics', 40),
    (5, 'Wireless Mouse', 'Ergonomic design, 4000 DPI sensor', 59.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpower-wireless-charger/thumbnail.webp', 'Accessories', 200),
    (6, 'USB-C Hub', '7-in-1 adapter with HDMI, SD card reader', 49.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-magsafe-battery-pack/thumbnail.webp', 'Accessories', 300),
    (7, 'Webcam HD 1080p', 'Auto-focus, built-in microphone, privacy cover', 79.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/tv-studio-camera-pedestal/thumbnail.webp', 'Electronics', 120),
    (8, 'Standing Desk Mat', 'Anti-fatigue ergonomic comfort mat', 39.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/selfie-lamp-with-iphone/thumbnail.webp', 'Office', 250),
    (9, 'Laptop Stand', 'Adjustable aluminum stand, heat dissipation', 44.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/monopod/thumbnail.webp', 'Accessories', 180),
    (10, 'Noise Machine', 'White noise, nature sounds, sleep timer', 29.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-homepod-mini-cosmic-grey/thumbnail.webp', 'Office', 90)
ON DUPLICATE KEY UPDATE image = VALUES(image), name = VALUES(name), description = VALUES(description), price = VALUES(price), category = VALUES(category), stock = VALUES(stock);
