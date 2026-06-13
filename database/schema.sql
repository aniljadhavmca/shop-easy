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
    shipping_phone VARCHAR(50),
    shipping_address TEXT,
    status ENUM('pending','paid','failed','shipped','delivered','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add shipping columns if table already exists (idempotent)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='shop_easy' AND TABLE_NAME='orders' AND COLUMN_NAME='shipping_name');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE orders ADD COLUMN shipping_name VARCHAR(255), ADD COLUMN shipping_email VARCHAR(255), ADD COLUMN shipping_phone VARCHAR(50), ADD COLUMN shipping_address TEXT', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add shipping_phone if missing (idempotent)
SET @phone_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='shop_easy' AND TABLE_NAME='orders' AND COLUMN_NAME='shipping_phone');
SET @sql2 = IF(@phone_exists = 0, 'ALTER TABLE orders ADD COLUMN shipping_phone VARCHAR(50) AFTER shipping_email', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Add 'failed' to status ENUM if not present (idempotent)
ALTER TABLE orders MODIFY COLUMN status ENUM('pending','paid','failed','shipped','delivered','cancelled') DEFAULT 'pending';

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
    (2, 'AirPods Max', 'Premium over-ear noise cancelling headphones', 549.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp', 'Electronics', 80),
    (3, 'Dell XPS 13', 'Intel i7, 16GB RAM, 13.4" InfinityEdge display', 1299.99, 'https://cdn.dummyjson.com/product-images/laptops/new-dell-xps-13-9300-laptop/thumbnail.webp', 'Electronics', 150),
    (4, 'iPhone 13 Pro', 'A15 Bionic, ProMotion display, 128GB', 999.99, 'https://cdn.dummyjson.com/product-images/smartphones/iphone-13-pro/thumbnail.webp', 'Electronics', 40),
    (5, 'Apple AirPods', 'Wireless earbuds with charging case', 129.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods/thumbnail.webp', 'Accessories', 200),
    (6, 'Apple Watch Series 4', 'GPS, heart rate monitor, 44mm gold aluminum', 399.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-watch-series-4-gold/thumbnail.webp', 'Accessories', 300),
    (7, 'Amazon Echo Plus', 'Smart speaker with Alexa, premium sound', 79.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/amazon-echo-plus/thumbnail.webp', 'Electronics', 120),
    (8, 'HomePod Mini', 'Compact smart speaker, Siri built-in', 99.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-homepod-mini-cosmic-grey/thumbnail.webp', 'Electronics', 250),
    (9, 'Wireless Charger', 'Fast charging pad, Qi compatible', 29.99, 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpower-wireless-charger/thumbnail.webp', 'Accessories', 180),
    (10, 'Lenovo Yoga 920', '2-in-1 convertible, i7, 14" 4K touchscreen', 1399.99, 'https://cdn.dummyjson.com/product-images/laptops/lenovo-yoga-920/thumbnail.webp', 'Electronics', 90)
ON DUPLICATE KEY UPDATE image = VALUES(image), name = VALUES(name), description = VALUES(description), price = VALUES(price), category = VALUES(category), stock = VALUES(stock);
