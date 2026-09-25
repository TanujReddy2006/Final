import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { db, query, id, now, mapCertificate } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certificateDir = path.resolve(__dirname, '..', '..', 'storage', 'certificates');
const publicBase = (
  process.env.PUBLIC_BASE_URL ||
  (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : '') ||
  'http://localhost:5173'
).replace(/\/+$/, '');

const pdfPath = certificateId => path.join(certificateDir, `${certificateId}.pdf`);

const pdfText = value =>
  String(value || '').replace(/[\\()\r\n]/g, character =>
    ({ '\\': '\\\\', '(': '\\(', ')': '\\)', '\r': ' ', '\n': ' ' }[character])
  );

function createCertificatePdf(certificate, course) {
  const qr = QRCode.create(`${publicBase}/verify/certificate/${certificate.certificateId}`, {
    errorCorrectionLevel: 'M'
  });
  const size = qr.modules.size;
  const scale = 3;
  const qrX = 680;
  const qrY = 410;
  const commands = [];

  commands.push('q 3 w 28 28 785 539 re S 1 w 42 42 757 511 re S Q');

  const text = (value, x, y, fontSize, bold = false) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${fontSize} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`);
  };

  text('LEARNFORGE / CERTIFICATION REGISTRY', 260, 505, 13, true);
  text('CERTIFICATE OF COMPLETION', 240, 455, 25, true);
  text('This certificate is awarded to', 305, 395, 13);
  text(certificate.learnerName, 335, 350, 24, true);
  text('for successfully completing', 310, 305, 13);
  text(course.title, 260, 260, 21, true);
  text(`Score: ${certificate.score}%`, 100, 205, 11);
  text(`Issued by: ${certificate.issuedBy}`, 300, 205, 11);
  text(`Completion date: ${new Date(certificate.completionDate).toLocaleDateString()}`, 520, 205, 11);
  text(`Certificate ID: ${certificate.certificateId}`, 80, 80, 11, true);
  text('Scan to verify', 690, 80, 9);

  commands.push('0 0 0 rg');
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.modules.get(row, column)) {
        commands.push(`${qrX + column * scale} ${qrY - row * scale} ${scale} ${scale} re f`);
      }
    }
  }

  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return Buffer.from(pdf);
}

export async function issueCertificate({ user, course, score = 0 }) {
  const { rows: existingRows } = await query(
    'SELECT * FROM certificates WHERE course_id = $1 AND learner_id = $2',
    [course.id, user.id]
  );

  if (existingRows.length > 0) {
    const existing = mapCertificate(existingRows[0]);
    if (score > existing.score) {
      existing.score = score;
      await query('UPDATE certificates SET score = $1 WHERE id = $2', [score, existing.id]);
      await fs.mkdir(certificateDir, { recursive: true });
      await fs.writeFile(pdfPath(existing.certificateId), createCertificatePdf(existing, course));
    }
    const idx = (db.certificates || []).findIndex(c => c.id === existing.id);
    if (idx >= 0) db.certificates[idx] = existing;
    return existing;
  }

  const certificateId = `CERT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const certCountRes = await query('SELECT COUNT(*) AS count FROM certificates');
  const certSeq = parseInt(certCountRes.rows[0]?.count || 0, 10) + 1;
  const certificateNumber = `CERT-${new Date().getFullYear()}-${String(certSeq).padStart(4, '0')}`;

  const certificate = {
    id: id(),
    certificateId,
    certificateNumber,
    learnerName: user.name,
    learnerId: user.id,
    certification: `${course.title} Certificate`,
    courseName: course.title,
    companyId: course.companyId,
    issuedBy: course.instructorName || 'LearnForge provider',
    completionDate: now(),
    issuedDate: now(),
    expiryDate: null,
    score,
    skills: course.skills || [],
    status: 'VALID',
    verificationUrl: `${publicBase}/verify/certificate/${certificateId}`,
    pdfUrl: `/api/v1/certificates/${certificateId}/pdf`,
    courseId: course.id
  };

  await query(
    `INSERT INTO certificates (
       id, certificate_id, certificate_number, learner_id, learner_name, course_id, course_name,
       certification, issued_by, score, completion_date, issued_date, expiry_date,
       verification_url, pdf_url, status, skills
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      certificate.id,
      certificate.certificateId,
      certificate.certificateNumber,
      certificate.learnerId,
      certificate.learnerName,
      certificate.courseId,
      certificate.courseName,
      certificate.certification,
      certificate.issuedBy,
      certificate.score,
      certificate.completionDate,
      certificate.issuedDate,
      certificate.expiryDate,
      certificate.verificationUrl,
      certificate.pdfUrl,
      certificate.status,
      JSON.stringify(certificate.skills || [])
    ]
  );

  await fs.mkdir(certificateDir, { recursive: true });
  await fs.writeFile(pdfPath(certificateId), createCertificatePdf(certificate, course));
  db.certificates = db.certificates || [];
  db.certificates.push(certificate);

  return certificate;
}

export async function readCertificatePdf(certificateId) {
  try {
    return await fs.readFile(pdfPath(certificateId));
  } catch (error) {
    // Self-healing: if file is not on disk (e.g. after container restart), regenerate it!
    const queryStr = String(certificateId || '').trim().toLowerCase();
    const { rows } = await query(
      `SELECT c.*, crs.title as crs_title
       FROM certificates c
       LEFT JOIN courses crs ON c.course_id = crs.id
       WHERE LOWER(c.certificate_id) = LOWER($1)
          OR LOWER(c.certificate_number) = LOWER($1)
          OR LOWER(c.id) = LOWER($1)`,
      [queryStr]
    );

    if (rows && rows.length > 0) {
      const certificate = mapCertificate(rows[0]);
      const course = {
        title: rows[0].crs_title || certificate.courseName || certificate.certification || 'Certified Course'
      };
      const pdfBuffer = createCertificatePdf(certificate, course);
      try {
        await fs.mkdir(certificateDir, { recursive: true });
        await fs.writeFile(pdfPath(certificate.certificateId), pdfBuffer);
      } catch {
        // Ignore file caching error on read-only/ephemeral storage
      }
      return pdfBuffer;
    }

    throw error;
  }
}
