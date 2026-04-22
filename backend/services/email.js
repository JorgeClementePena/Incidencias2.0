// backend/services/email.js

const nodemailer = require('nodemailer');
const { query } = require('../db/db');

const smtpHost = (process.env.SMTP_HOST || '').trim();
const smtpPort = parseInt(process.env.SMTP_PORT || '25', 10);
const smtpUser = (process.env.SMTP_USER || '').trim();
const smtpPass = process.env.SMTP_PASS || '';
const smtpReady = !!smtpHost;

const transporter = smtpReady ? (() => {
  const config = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
  };

  if (smtpUser && smtpPass) {
    config.auth = { user: smtpUser, pass: smtpPass };
  }

  return nodemailer.createTransport(config);
})() : null;

if (transporter) {
  transporter.verify().then(() => {
    console.log('[EMAIL] Servidor SMTP conectado ✓');
  }).catch(err => {
    console.warn('[EMAIL] SMTP no disponible:', err.message, '— Los emails se simularán en consola.');
  });
}

function buildEmailHTML(nc) {
  const catColor = {
    'Crítica': '#c0392b', 'Mayor': '#d68910',
    'Menor': '#1a8870',   'Observación': '#7f8c8d',
  }[nc.categoria] || '#555';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
  .wrapper { max-width: 620px; margin: 30px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  .header { background: #0d5c4e; color: white; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header .nc-id { font-size: 28px; font-weight: bold; margin-top: 4px; font-family: monospace; }
  .body { padding: 24px 28px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; color: white; background: ${catColor}; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
  .field label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 3px; }
  .field p { font-size: 14px; color: #333; margin: 0; background: #f8f9fa; padding: 8px 12px; border-radius: 6px; }
  .full { grid-column: 1/-1; }
  .section-title { font-size: 12px; font-weight: bold; color: #0d5c4e; text-transform: uppercase; letter-spacing: 0.07em; margin: 20px 0 10px; border-top: 1px solid #e0e0e0; padding-top: 16px; }
  .footer { background: #f8f9fa; padding: 16px 28px; font-size: 12px; color: #888; border-top: 1px solid #e0e0e0; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🔔 Nueva Incidencia Registrada</h1>
    <div class="nc-id">${nc.id}</div>
  </div>
  <div class="body">
    ${nc.categoria ? `<span class="badge">${nc.categoria}</span>` : ''}
    <div class="grid">
      <div class="field"><label>Proyecto</label><p>${nc.codigo_proyecto}</p></div>
      <div class="field"><label>Proceso / PE</label><p>${nc.proceso}</p></div>
      <div class="field"><label>Fecha detección</label><p>${nc.fecha_deteccion}</p></div>
      <div class="field"><label>Detectado por</label><p>${nc.detectado_por}</p></div>
      <div class="field"><label>Email remitente</label><p>${nc.email_remitente || '—'}</p></div>
      <div class="field"><label>Departamento</label><p>${nc.departamento}</p></div>
      <div class="field"><label>Área</label><p>${nc.area || '—'}</p></div>
      <div class="field"><label>Programa</label><p>${nc.programa || '—'}</p></div>
      <div class="field"><label>Valoración €</label><p>${nc.valoracion_euros ? nc.valoracion_euros + ' €' : '—'}</p></div>
      <div class="field"><label>¿Afecta al MA?</label><p>${nc.afecta_ma ? 'Sí' : 'No'}</p></div>
      <div class="field"><label>Afecta resultado</label><p>${nc.afecta_resultado ? 'Sí' : 'No'}</p></div>
      <div class="field full"><label>Descripción</label><p>${nc.descripcion}</p></div>
    </div>
    ${nc.causas ? `<div class="section-title">Análisis</div><div class="field"><label>Causas</label><p>${nc.causas}</p></div>` : ''}
    ${nc.accion_inmediata ? `<div class="field" style="margin-top:10px"><label>Acción inmediata</label><p>${nc.accion_inmediata}</p></div>` : ''}
    ${nc.accion_correctora ? `<div class="field" style="margin-top:10px"><label>Acción correctora</label><p>${nc.accion_correctora}</p></div>` : ''}
    ${nc.observaciones ? `<div class="field" style="margin-top:10px"><label>Observaciones</label><p>${nc.observaciones}</p></div>` : ''}
  </div>
  <div class="footer">
    Este mensaje ha sido generado automáticamente por Incidencias Fidamc.<br>
    No responder a este correo.
  </div>
</div>
</body></html>`;
}

async function sendNCEmail(nc) {
  const to      = nc.email_destino;
  const cc      = nc.email_cc || undefined;
  const subject = `[NC] ${nc.id} — ${nc.codigo_proyecto} | ${nc.categoria || 'Sin categoría'}`;

  if (!transporter) {
    console.log(`[EMAIL] (simulado) Para: ${to} | Asunto: ${subject}`);
    await query('UPDATE email_log SET enviado = 1 WHERE nc_id = ?', [nc.id]).catch(() => {});
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Incidencias Fidamc" <${process.env.EMAIL_FROM || smtpUser}>`,
      to, cc, subject,
      html: buildEmailHTML(nc),
    });
    await query('UPDATE email_log SET enviado = 1 WHERE nc_id = ?', [nc.id]).catch(() => {});
    console.log(`[EMAIL] Enviado a ${to}`);
  } catch (err) {
    console.error(`[EMAIL] Error enviando a ${to}:`, err.message);
    await query('UPDATE email_log SET enviado = 0, error_msg = ? WHERE nc_id = ?', [err.message, nc.id]).catch(() => {});
    throw err;
  }
}

async function sendVerificationEmail(email, name, code) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#1a5c4a;padding:24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0">⚙️ Incidencias Fidamc</h2>
      </div>
      <div style="background:#f8f9fa;padding:32px;border-radius:0 0 8px 8px">
        <p style="font-size:16px">Hola <strong>${name}</strong>,</p>
        <p>Tu código de verificación es:</p>
        <div style="background:white;border:2px solid #1a5c4a;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a5c4a">${code}</span>
        </div>
        <p style="color:#666;font-size:13px">Este código expira en <strong>15 minutos</strong>.</p>
        <p style="color:#666;font-size:13px">Si no has solicitado este registro, ignora este mensaje.</p>
      </div>
    </div>`;

  if (!transporter) {
    console.log(`[VERIFY EMAIL] Para: ${email} | Código: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: `"Incidencias Fidamc" <${process.env.EMAIL_FROM || smtpUser}>`,
    to:   email,
    subject: 'Tu código de verificación — Incidencias Fidamc',
    html,
  });
}

async function sendEditNotification(nc, emailCreador) {
  const subject = `[NC] ${nc.id} actualizada — ${nc.codigo_proyecto}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
      <div style="background:#0d5c4e;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:18px">✏️ Incidencia actualizada</h1>
        <div style="font-size:26px;font-weight:bold;margin-top:4px;font-family:monospace">${nc.id}</div>
      </div>
      <div style="background:#f8f9fa;padding:24px 28px;border-radius:0 0 8px 8px">
        <p>El equipo de Calidad ha actualizado la incidencia <strong>${nc.id}</strong> correspondiente al proyecto <strong>${nc.codigo_proyecto}</strong>.</p>
        ${nc.categoria ? `<p><strong>Categoría:</strong> ${nc.categoria}</p>` : ''}
        ${nc.accion_correctora ? `<p><strong>Acción correctora:</strong> ${nc.accion_correctora}</p>` : ''}
        <p><strong>Estado actual:</strong> ${nc.estado}</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">
        <p style="font-size:12px;color:#888">Este mensaje ha sido generado automáticamente por Incidencias Fidamc.</p>
      </div>
    </div>`;

  if (!transporter) {
    console.log(`[EMAIL] (simulado) Notificación creador: ${emailCreador} | ${subject}`);
    return;
  }

  await transporter.sendMail({
    from: `"Incidencias Fidamc" <${process.env.EMAIL_FROM || smtpUser}>`,
    to:   emailCreador,
    subject,
    html,
  });
}

async function sendRepeatThresholdAlert({ codigoProyecto, area, categoria, incidenciasTotal, ventanaDias }) {
  const admins = await query(
    'SELECT email FROM users WHERE role = ? AND active = 1 AND email IS NOT NULL AND email <> ?',
    ['admin', '']
  );
  const destinatarios = admins.rows.map(row => row.email).filter(Boolean);
  if (!destinatarios.length) return;

  const subject = `[NC] Umbral de repetición alcanzado: ${area} / ${categoria}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
      <div style="background:#b03a2e;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:18px">Aviso de repetición automática</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px 28px;border-radius:0 0 8px 8px">
        <p>Se ha alcanzado el umbral de repetición automática configurado para incidencias.</p>
        <p><strong>Área:</strong> ${area}</p>
        <p><strong>Categoría:</strong> ${categoria}</p>
        <p><strong>Incidencias detectadas:</strong> ${incidenciasTotal}</p>
        <p><strong>Ventana temporal:</strong> ${ventanaDias} días</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">
        <p style="font-size:12px;color:#888">Este mensaje ha sido generado automáticamente por Incidencias Fidamc.</p>
      </div>
    </div>`;

  if (!transporter) {
    console.log(`[EMAIL] (simulado) Alerta repetición para: ${destinatarios.join(', ')} | ${subject}`);
    return;
  }

  await transporter.sendMail({
    from: `"Incidencias Fidamc" <${process.env.EMAIL_FROM || smtpUser}>`,
    to: destinatarios.join(','),
    subject,
    html,
  });
}

module.exports = { sendNCEmail, sendVerificationEmail, sendEditNotification, sendRepeatThresholdAlert };
