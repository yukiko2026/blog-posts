const fs = require('fs');
const matter = require('gray-matter');
const fetch = require('node-fetch');
const { execSync } = require('child_process');

const WP_URL = process.env.WORDPRESS_URL;
const WP_USER = process.env.WORDPRESS_USERNAME;
const WP_PASS = process.env.WORDPRESS_PASSWORD;
const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

async function getChangedFiles() {
  try {
    const output = execSync('git diff --name-only HEAD~1 HEAD').toString();
    return output.split('\n').filter(f => f.startsWith('posts/') && f.endsWith('.md'));
  } catch (e) {
    const output = execSync('git show --name-only HEAD --format=').toString();
    return output.split('\n').filter(f => f.startsWith('posts/') && f.endsWith('.md'));
  }
}

async function findPost(slug) {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts?slug=${slug}&per_page=1`, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  const posts = await res.json();
  return posts[0] || null;
}

async function publishPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data: fm, content } = matter(raw);

  const body = {
    title: fm.title,
    content: content.trim(),
    status: fm.status || 'draft',
    slug: fm.slug,
  };

  const existing = fm.slug ? await findPost(fm.slug) : null;

  const url = existing
    ? `${WP_URL}/wp-json/wp/v2/posts/${existing.id}`
    : `${WP_URL}/wp-json/wp/v2/posts`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed: ${err}`);
  }

  const post = await res.json();
  console.log(`${existing ? 'Updated' : 'Created'}: ${fm.title} → ${post.link}`);
}

async function main() {
  const files = await getChangedFiles();
  console.log('Changed posts:', files);
  for (const f of files) {
    if (fs.existsSync(f)) await publishPost(f);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
