const fs = require('fs');
let content = fs.readFileSync('src/index.css', 'utf8');
content = content.replace(/#0288D1/g, '#120c7a');
content = content.replace(/#0277BD/g, '#100b6e');
content = content.replace(/#3b82f6/g, '#120c7a');
fs.writeFileSync('src/index.css', content, 'utf8');
