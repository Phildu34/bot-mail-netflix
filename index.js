require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const {
  IMAP_USER,
  IMAP_PASS,
  IMAP_HOST = 'imap.gmail.com',
  IMAP_PORT = 993
} = process.env;

if (!IMAP_USER || !IMAP_PASS) {
  console.error("IMAP_USER ou IMAP_PASS manquent dans les variables d'environnement");
  process.exit(1);
}

async function main() {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: Number(IMAP_PORT),
    secure: true,
    auth: {
      user: IMAP_USER,
      pass: IMAP_PASS
    }
  });

  try {
    // console.log('Connexion à IMAP...');
    await client.connect();
    // console.log('Connecté.');

    let lock = await client.getMailboxLock('INBOX');
    try {
      let uids = await client.search({
        from: 'info@account.netflix.com',
        seen: false
      });

      if (!uids || uids.length === 0) {
        // console.log('Pas de nouveaux emails de Netflix');
        return;
      }

      const lastSeq = uids[uids.length - 1];
      // console.log('Traitement de l\'email Netflix...');

      const { content } = await client.download(lastSeq, false);
      
      const chunks = [];
      for await (const chunk of content) {
        chunks.push(chunk);
      }
      const source = Buffer.concat(chunks);

      const parsed = await simpleParser(source);

      const html = parsed.html;
      if (!html) {
        // console.log("L'email ne contient pas de HTML");
        return;
      }

      const $ = cheerio.load(html);
      let targetHref = null;

      $('a').each((i, el) => {
        const text = $(el).text().trim();
        if (text.toLowerCase().includes('oui, c\'était moi')) {
          targetHref = $(el).attr('href');
        }
      });

      if (!targetHref) {
        // console.log("Lien de confirmation introuvable");
        await client.messageFlagsAdd(lastSeq, ['\\Seen']);
        return;
      }

      console.log('Mail de confirmation de foyer reçu');

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      
      await page.goto(targetHref, { waitUntil: 'networkidle2' });
      
      try {
        await page.waitForSelector('button[data-uia="set-primary-location-action"]', {
          timeout: 10000
        });
        
        await page.click('button[data-uia="set-primary-location-action"]');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const pageContent = await page.content();
        
        if (pageContent.includes('mis à jour') || pageContent.includes('confirmé') || pageContent.includes('foyer Netflix')) {
          console.log('✅ Foyer Netflix mis à jour !');
        } else {
          console.log('⚠️  Sans doute un problème de mise à jour du foyer Netflix');
        }
        
      } catch (error) {
        // console.error('❌ Erreur :', error.message);
      } finally {
        await browser.close();
      }

      await client.messageFlagsAdd(lastSeq, ['\\Seen']);
      console.log('Mail traité');
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('Erreur :', err.message);
  } finally {
    await client.logout();
  }
}

main();
