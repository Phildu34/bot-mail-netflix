require('dotenv').config();
const pino = require('pino');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'trace',
        base: { component: 'botmail-netflix' },
        timestamp: pino.stdTimeFunctions.epochTime
    }
);

const LOCK_PATH = path.join(process.cwd(), 'botmail-netflix.lock');

async function withProcessLock(fn) {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    try {
        await fn();
    } finally {
        fs.closeSync(fd);
        fs.unlinkSync(LOCK_PATH);
    }
}

const {
  IMAP_USER,
  IMAP_PASS,
  IMAP_HOST = 'imap.gmail.com',
  IMAP_PORT = 993
} = process.env;

if (!IMAP_USER || !IMAP_PASS) {
    logger.debug('🟥 IMAP_USER ou IMAP_PASS manquent dans les variables d\'environnement');
    process.exit(1);
}

async function timeoutPromise(ms) {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout global après ${ms}ms`)), ms)
    );
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
        logger.debug('🟢 Connexion à IMAP...');
    
        await client.connect();
    
        logger.debug('🟢 Connecté à IMAP');

        let lock = await client.getMailboxLock('INBOX');
        
        try {
            let uids = await client.search({
                from: 'info@account.netflix.com',
                seen: false
            });

            if (!uids || uids.length === 0) {
                logger.debug('🟢 Pas de nouveaux emails de Netflix');
            return;
            }

            const lastSeq = uids[uids.length - 1];
        
            logger.debug('🟢 Traitement de l\'email Netflix...');

            const { content } = await client.download(lastSeq, false);
      
            const chunks = [];
            for await (const chunk of content) {
                chunks.push(chunk);
            }
        
            const source = Buffer.concat(chunks);

            const parsed = await simpleParser(source);

            const html = parsed.html;
            if (!html) {
                logger.debug('❌ L\'email ne contient pas de HTML : sans doute pas un mail de modification du foyer');
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
                logger.debug('❌ Lien de confirmation introuvable : sans doute pas un mail de modification du foyer');
                await client.messageFlagsAdd(lastSeq, ['\\Seen']);
                return;
            }

            logger.debug('🟢 On a un mail de confirmation de foyer a traiter !');

            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            try {
                await Promise.race([
                    (async () => {
                        const page = await browser.newPage();
                        
                        logger.debug('🟢 goto : ' + targetHref);
                        
                        await page.goto(targetHref, { waitUntil: 'networkidle2' });
                  
                        const buttons = await page.$$('button');
                        logger.debug('🟢 Nombre de boutons trouvés : ' + buttons.length);
                        const buttonInfos = await Promise.all(
                            buttons.map(btn => page.evaluate(el => ({
                                text: el.textContent.trim(),
                                dataUia: el.getAttribute('data-uia')
                            }), btn))
                        );
                        logger.debug('🟢 Infos des boutons : ' + JSON.stringify(buttonInfos, null, 2));
                        
                        try {
                            await page.waitForSelector('button[data-uia="set-primary-location-action"]', {
                                timeout: 60000
                            });
                    
                            await page.click('button[data-uia="set-primary-location-action"]');
                    
                            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 70000 }).catch(() => {});
                    
                            await new Promise(resolve => setTimeout(resolve, 80000));
                    
                            const pageContent = await page.content();
                    
                            if (pageContent.includes('mis à jour') || pageContent.includes('confirmé') || pageContent.includes('foyer Netflix')) {
                                logger.debug('✅ Foyer Netflix mis à jour !');
                            } else {
                                logger.debug('⚠️ Sans doute un problème de mise à jour du foyer Netflix');
                            }
                    
                        } catch (error) {
                            logger.debug('❌ Erreur Puppeteer : ' + error.message);
                        } finally {
                            await page.close();
                        }
                    })(),
                    timeoutPromise(120000) // 120 secondes de timeout global
                ]);
            } finally {
                await browser.close();
            }

            await client.messageFlagsAdd(lastSeq, ['\\Seen']);
            logger.debug('✅ mail de modification de foyer traité.');
            
        } finally {
            lock.release();
        }
    } catch (err) {
        logger.debug('🟥 Erreur : ' + err.message);
    } finally {
        await client.logout();
    }
}

withProcessLock(main).catch(err => {
    if (err && err.code === 'EEXIST') {
        logger.debug('🟥 Une exécution est déjà en cours ->> sortie.');
        return;
    }
    logger.error('🟥 Erreur : ' + err.message);
});
