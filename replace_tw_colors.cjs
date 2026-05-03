const fs = require('fs');

const files = ['src/pages/Upload.jsx', 'src/components/CIAConfigPage.tsx'];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/bg-blue-600/g, 'bg-[#120c7a]');
    content = content.replace(/hover:bg-blue-700/g, 'hover:bg-[#100b6e]');
    content = content.replace(/text-blue-600/g, 'text-[#120c7a]');
    content = content.replace(/hover:text-blue-800/g, 'hover:text-[#0a0749]');
    content = content.replace(/border-blue-600/g, 'border-[#120c7a]');
    content = content.replace(/ring-blue-200/g, 'ring-[#120c7a]/30');
    content = content.replace(/ring-blue-500/g, 'ring-[#120c7a]');
    content = content.replace(/accent-blue-600/g, 'accent-[#120c7a]');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
