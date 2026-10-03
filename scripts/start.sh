#!/bin/bash
# Di chuyển vào thư mục ứng dụng Node.js trên EC2
cd /home/ec2-user/node-app

# Load môi trường NVM / Node.js
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Cài đặt các package từ package.json
npm install

# Dừng app Node.js cũ (nếu có) và khởi chạy app mới bằng PM2
pm2 delete node-app || true
pm2 start app.js --name "node-app"
pm2 save