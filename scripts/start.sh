#!/bin/bash
# Đảm bảo ec2-user nắm quyền thư mục app
sudo chown -R ec2-user:ec2-user /home/ec2-user/node-app

cd /home/ec2-user/node-app

# Nạp môi trường NVM / Node.js
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Cài đặt thư viện
npm install

# Dừng app cũ và khởi chạy app mới
pm2 delete node-app || true
pm2 start app.js --name "node-app"
pm2 save