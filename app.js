const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Node.js AWS CI/CD Demo</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f4f9; }
            h1 { color: #232f3e; }
            p { color: #555; font-size: 18px; }
            .status { color: #2e7d32; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>Hello Node.js App!</h1>
        <p>Deployed via <span class="status">AWS CI/CD Pipeline (CodePipeline & CodeDeploy)</span></p>
        <p>Version: 1.0.0</p>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});