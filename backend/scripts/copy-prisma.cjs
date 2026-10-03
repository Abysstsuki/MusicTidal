const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const source = path.join(backendRoot, 'src', 'generated', 'prisma');
const destination = path.join(backendRoot, 'dist', 'generated', 'prisma');

if (!fs.existsSync(source)) {
  console.error('Prisma client missing. Run npx prisma generate before npm run build.');
  process.exit(1);
}
fs.cpSync(source, destination, { recursive: true });
