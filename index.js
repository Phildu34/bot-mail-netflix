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
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'IMAP_USER ou IMAP_PASS manquent dans les variables d\'environnement' }));
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
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Connexion à IMAP...' }));
    
    await client.connect();
    
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Connecté à IMAP' }));

    let lock = await client.getMailboxLock('INBOX');
    try {
        let uids = await client.search({
            from: 'info@account.netflix.com',
            seen: false
        });

        if (!uids || uids.length === 0) {
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Pas de nouveaux emails de Netflix' }));
        return;
        }

        const lastSeq = uids[uids.length - 1];
        
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Traitement de l\'email Netflix...' }));

      const { content } = await client.download(lastSeq, false);
      
      const chunks = [];
      for await (const chunk of content) {
        chunks.push(chunk);
      }
        
      const source = Buffer.concat(chunks);

      const parsed = await simpleParser(source);

      const html = parsed.html;
      if (!html) {
          console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'L\'email ne contient pas de HTML : sans doute pas un mail de modification du foyer' }));
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
          console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Lien de confirmation introuvable : sans doute pas un mail de modification du foyer' }));
          await client.messageFlagsAdd(lastSeq, ['\\Seen']);
        return;
      }

        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'On a un mail de confirmation de foyer a traiter !' }));

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
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: '✅ Foyer Netflix mis à jour !' }));

        } else {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: '⚠️  Sans doute un problème de mise à jour du foyer Netflix' }));
        }
        
      } catch (error) {
          console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: '❌ Erreur :' + error.message }));

      } finally {
        await browser.close();
      }

      await client.messageFlagsAdd(lastSeq, ['\\Seen']);
      console.log(JSON.stringify({
         timestamp: new Date().toISOString(),
         level: 'info',
         message: 'mail de modification de foyer traité.' }));
    } finally {
      lock.release();
    }
  } catch (err) {
      console.log(JSON.stringify({
         timestamp: new Date().toISOString(),
         level: 'error',
         message: err.message }));
  } finally {
    await client.logout();
  }
}

main();
