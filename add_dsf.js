const fs = require('fs');

try {
    let renderContent = fs.readFileSync('model/render.js', 'utf8');
    // Add deviceScaleFactor: 2 after type: 'png'
    renderContent = renderContent.replace(/type:\s*'png',/g, "type: 'png',\n            deviceScaleFactor: 2,");
    fs.writeFileSync('model/render.js', renderContent, 'utf8');
    console.log('Fixed model/render.js to use deviceScaleFactor: 2');
} catch (e) {
    console.error('Error modifying model/render.js:', e);
}
