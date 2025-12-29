const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

async function fetchImageAsBase64(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return `data:${response.headers.get('content-type') || 'image/png'};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch (error) {
    console.error("Erreur image:", error);
    return null;
  }
}

// 1. CORPS DU DOCUMENT
const generateBodyContent = (data) => {
  const formatPrice = (p) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(p || 0);
  const total_ht = data.total_ht || 0;
  const tva_amount = (total_ht * (data.tva || 20)) / 100;
  const total_ttc = total_ht + tva_amount;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #333; -webkit-print-color-adjust: exact; padding-top: 10px; }
      
      :root { --primary: #3b82f6; --light-bg: #f8fafc; }

      /* Si papier entête personnalisé, on descend un peu plus le contenu */
      ${data.papier_entete ? 'body { padding-top: 20px; }' : ''}

      .client-section { display: flex; justify-content: flex-end; margin-bottom: 40px; }
      .client-box { width: 45%; background: var(--light-bg); padding: 15px; border-radius: 6px; border-left: 4px solid var(--primary); }
      .client-label { color: var(--primary); font-weight: bold; font-size: 10px; text-transform: uppercase; margin-bottom: 5px; }
      .client-name { font-weight: bold; font-size: 13px; margin-bottom: 3px; color: #1e3a8a; }
      .client-details { font-size: 11px; line-height: 1.4; color: #444; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; margin-top: 20px; }
      th { background: var(--primary); color: white; padding: 10px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: bold; }
      td { padding: 12px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
      tr:nth-child(even) td { background-color: #f9fafb; } 
      
      .col-desc { width: 45%; }
      .col-unit { width: 10%; text-align: center; }
      .col-qty { width: 10%; text-align: center; }
      .col-price { text-align: right; width: 15%; }
      .col-total { text-align: right; width: 20%; font-weight: bold; }

      .totals-section { display: flex; justify-content: flex-end; page-break-inside: avoid; }
      .totals-box { width: 45%; }
      .total-row { display: flex; justify-content: space-between; padding: 8px 10px; background: var(--light-bg); margin-bottom: 2px; border-radius: 4px; font-weight: bold; color: #555; }
      .total-row.final { background: var(--primary); color: white; font-size: 14px; margin-top: 5px; }
    </style>
  </head>
  <body>
    
    <div class="client-section">
      <div class="client-box">
        <div class="client-label">ADRESSÉ À :</div>
        <div class="client-name">${data.client_nom}</div>
        <div class="client-details">
          ${data.client_adresse || ''}<br>
          ${data.client_cp || ''} ${data.client_ville || ''}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-unit">Unité</th>
          <th class="col-qty">Qté</th>
          <th class="col-price">Prix U. HT</th>
          <th class="col-total">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${data.prestations.map(p => `
          <tr>
            <td>
              <div style="font-weight:bold; color:#333;">${p.libelle.split('\n')[0]}</div>
              <div style="font-size:10px; color:#666; margin-top:2px;">${p.libelle.split('\n').slice(1).join('<br>')}</div>
            </td>
            <td class="col-unit">${p.unite || '-'}</td>
            <td class="col-qty">${p.quantite}</td>
            <td class="col-price">${formatPrice(p.prix_unitaire)}</td>
            <td class="col-total">${formatPrice(p.total_ht)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row"><span>Total HT</span><span>${formatPrice(total_ht)}</span></div>
        <div class="total-row"><span>TVA (${data.tva}%)</span><span>${formatPrice(tva_amount)}</span></div>
        <div class="total-row final"><span>NET À PAYER</span><span>${formatPrice(total_ttc)}</span></div>
      </div>
    </div>

    ${data.conditions_generales ? `
      <div style="margin-top: 30px; font-size: 10px; color: #666; page-break-inside: avoid;">
        <strong>Conditions :</strong><br>${data.conditions_generales}
      </div>
    ` : ''}
  </body>
  </html>
  `;
};

// 2. HEADER TEMPLATE (En-tête)
const getHeaderTemplate = (data, logoBase64, headerBase64) => {
  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR');
  
  // --- CAS 1 : Papier entête personnalisé ---
  if (headerBase64) {
    return `
      <style>
        .header-container {
          width: 100%; height: 100%; padding: 0; margin: 0;
          padding-right: 15mm; 
          box-sizing: border-box;
          display: flex; justify-content: flex-end; align-items: center;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          
          /* L'image de fond remplit tout */
          background-image: url('${headerBase64}');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        .doc-info { 
          text-align: right; 
          background: rgba(255,255,255,0.8); 
          padding: 8px 12px; 
          border-radius: 6px; 
          margin-top: 2cm;
        }
        .doc-title { font-size: 24px; font-weight: bold; color: #3b82f6; margin: 0; line-height: 1; }
        .doc-meta { font-size: 11px; margin-top: 4px; color: #333; font-weight: bold; }
      </style>
      <div class="header-container">
        <div class="doc-info">
          <div class="doc-title">${data.type_document}</div>
          <div class="doc-meta">N° ${data.numero}<br>${formatDate(data.date_creation)}</div>
        </div>
      </div>
    `;
  }

  // --- CAS 2 : Standard (Logo + Texte) ---
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="height: 2cm; max-width: 300px; object-fit: contain;" />`
    : `<h1 style="color:#3b82f6; margin:0; font-size:22px;">${data.user_entreprise || 'Mon Entreprise'}</h1>`;

  return `
    <style>
      .header-container { width: 100%; height: 100%; padding: 0 15mm; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; background: white; }
      .col-left { display: flex; flex-direction: column; justify-content: center; }
      .company-details { font-size: 9px; color: #555; line-height: 1.3; margin-top: 5px; }
      .col-right { text-align: right; }
      .doc-title { font-size: 28px; font-weight: bold; color: #3b82f6; text-transform: uppercase; margin: 0; line-height: 1; }
      .doc-meta { font-size: 10px; margin-top: 5px; color: #444; }
    </style>
    <div class="header-container">
      <div class="col-left">
        ${logoHtml}
        <div class="company-details">
          <strong>${data.user_entreprise || ''}</strong><br>
          ${data.user_adresse || ''}<br>
          ${data.user_cp || ''} ${data.user_ville || ''}<br>
          SIRET: ${data.user_siret || ''}
        </div>
      </div>
      <div class="col-right">
        <div class="doc-title">${data.type_document || 'DEVIS'}</div>
        <div class="doc-meta"><strong>N° :</strong> ${data.numero || 'PROVISOIRE'}<br><strong>Date :</strong> ${formatDate(data.date_creation)}</div>
      </div>
    </div>
  `;
};

// 3. FOOTER TEMPLATE (Pied de page)
const getFooterTemplate = (data, headerBase64) => {
  // SI PAPIER ENTÊTE PRÉSENT : On ne met PAS de pied de page texte (car déjà sur l'image)
  if (headerBase64) {
    return `<div style="width: 100%; font-size: 8px; text-align: center; color: #999;">Page <span class="pageNumber"></span>/<span class="totalPages"></span></div>`;
  }

  // SINON : Pied de page standard
  return `
    <style>
      .footer-container { width: 100%; font-size: 8px; text-align: center; color: #94a3b8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; border-top: 1px solid #e5e7eb; padding-top: 8px; margin: 0 15mm; -webkit-print-color-adjust: exact; }
    </style>
    <div class="footer-container">
      ${data.user_entreprise} - ${data.user_adresse} ${data.user_cp} ${data.user_ville} - Tél: ${data.user_phone || ''} - Email: ${data.user_email || ''}<br>
      SIRET : ${data.user_siret} - Document généré par BatiProAI
    </div>
  `;
};

// --- ROUTE API ---
app.post('/generate-pdf', async (req, res) => {
  try {
    console.log('📲 Nouvelle demande PDF...');
    const data = req.body;

    let logoBase64 = null;
    if (data.user_logo) { logoBase64 = await fetchImageAsBase64(data.user_logo); }

    // On récupère le papier entête
    let headerBase64 = null;
    if (data.papier_entete) { headerBase64 = await fetchImageAsBase64(data.papier_entete); }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });

    const page = await browser.newPage();
    
    await page.setContent(generateBodyContent(data), { waitUntil: 'load', timeout: 120000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      // On passe l'info "headerBase64" aux templates
      headerTemplate: getHeaderTemplate(data, logoBase64, headerBase64),
      footerTemplate: getFooterTemplate(data, headerBase64),
      margin: {
        top: '50mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      },
      timeout: 120000
    });
    
    await browser.close();
    console.log('✅ PDF envoyé !');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ ERREUR SERVEUR :', error);
    res.status(500).send('Erreur : ' + error.message);
  }
});

app.listen(PORT, () => console.log(`🚀 Serveur PDF lancé sur le port ${PORT}`));
