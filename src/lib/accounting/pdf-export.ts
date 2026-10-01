import PDFDocument from "pdfkit";
import {
  balanceReport,
  employmentResources,
  money,
  narrativeMetrics,
  operatingStatement,
  projectBudget,
  reconcileAccount,
  yearEntries,
} from "./calculations";
import type { Workspace } from "./types";

export type PdfReportKind = "financial" | "narrative";

type PdfColumn = { label: string; weight: number; align?: "left" | "right" };
type PdfRow = Array<string | number>;

const forest = "#17382d";
const green = "#287252";
const copper = "#c29655";
const ink = "#26352e";
const muted = "#66766d";

function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

function createDocument(workspace: Workspace, year: number, title: string) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 42,
    bufferPages: true,
    info: {
      Title: `${title} — ${year}`,
      Author: "Compta SYCEBNL+",
      Subject: "État comptable",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const header = (firstPage = false) => {
    const width = doc.page.width;
    doc.save();
    doc.rect(0, 0, width, firstPage ? 105 : 78).fill(forest);
    doc.rect(0, firstPage ? 101 : 74, width, 4).fill(copper);
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(firstPage ? 20 : 15);
    doc.text("Compta SYCEBNL+", 42, 25, { lineBreak: false });
    doc.fillColor("#dce8df").font("Helvetica").fontSize(9);
    doc.text("GESTION COMPTABLE · ÉTATS FINANCIERS", 42, firstPage ? 56 : 49, {
      characterSpacing: 0.7,
      lineBreak: false,
    });
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(firstPage ? 15 : 11);
    doc.text(`EXERCICE ${year}`, width - 160, firstPage ? 31 : 25, {
      width: 118,
      align: "right",
      lineBreak: false,
    });
    doc.restore();
    doc.y = firstPage ? 125 : 96;
    if (firstPage) {
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(18).text(title, 42, 116);
      doc.y = doc.y + 3;
      const organization = workspace.reportSettings.organizationName.trim();
      if (organization) {
        doc.fillColor(muted).font("Helvetica").fontSize(10).text(organization, 42, doc.y);
        doc.y += 16;
      }
      doc.fillColor(muted).font("Helvetica").fontSize(8);
      doc.text(`Édité le ${new Date().toLocaleDateString("fr-FR")}`, 42, doc.y);
      doc.y += 19;
    }
  };

  header(true);

  const newPage = () => {
    doc.addPage();
    header(false);
  };

  const ensure = (height: number) => {
    if (doc.y + height > doc.page.height - 48) newPage();
  };

  const section = (name: string, note?: string) => {
    ensure(44);
    doc.moveDown(0.45);
    doc.fillColor(forest).font("Helvetica-Bold").fontSize(12).text(name, 42, doc.y);
    doc.moveDown(0.1);
    if (note) {
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(note, 42, doc.y, { width: 510 });
      doc.moveDown(0.25);
    }
    doc.strokeColor(copper).lineWidth(1.2).moveTo(42, doc.y).lineTo(553, doc.y).stroke();
    doc.y += 8;
  };

  const table = (columns: PdfColumn[], rows: PdfRow[]) => {
    const left = 42;
    const totalWidth = 511;
    const sumWeight = columns.reduce((sum, column) => sum + column.weight, 0);
    const widths = columns.map((column) => (totalWidth * column.weight) / sumWeight);
    const headerHeight = 24;
    ensure(headerHeight + 30);
    let y = doc.y;
    doc.rect(left, y, totalWidth, headerHeight).fill(forest);
    let x = left;
    columns.forEach((column, index) => {
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
      doc.text(column.label, x + 5, y + 7, {
        width: widths[index] - 10,
        height: headerHeight - 10,
        align: column.align || "left",
        ellipsis: true,
      });
      x += widths[index];
    });
    y += headerHeight;

    rows.forEach((row, rowIndex) => {
      const values = columns.map((_, index) => String(row[index] ?? "—"));
      const heights = values.map((value, index) => {
        doc.font("Helvetica").fontSize(7.6);
        return doc.heightOfString(value, { width: Math.max(24, widths[index] - 10) });
      });
      const rowHeight = Math.max(23, Math.min(54, Math.max(...heights) + 10));
      if (y + rowHeight > doc.page.height - 48) {
        newPage();
        y = doc.y;
        doc.rect(left, y, totalWidth, headerHeight).fill(forest);
        let headerX = left;
        columns.forEach((column, index) => {
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);
          doc.text(column.label, headerX + 5, y + 7, {
            width: widths[index] - 10,
            height: headerHeight - 10,
            align: column.align || "left",
            ellipsis: true,
          });
          headerX += widths[index];
        });
        y += headerHeight;
      }
      doc.rect(left, y, totalWidth, rowHeight).fill(rowIndex % 2 ? "#f3f6f3" : "#ffffff");
      doc
        .strokeColor("#e4eae5")
        .lineWidth(0.35)
        .moveTo(left, y + rowHeight)
        .lineTo(left + totalWidth, y + rowHeight)
        .stroke();
      x = left;
      values.forEach((value, index) => {
        doc.fillColor(ink).font("Helvetica").fontSize(7.6);
        doc.text(value, x + 5, y + 5, {
          width: widths[index] - 10,
          height: rowHeight - 8,
          align: columns[index].align || "left",
          ellipsis: true,
        });
        x += widths[index];
      });
      y += rowHeight;
    });
    doc.y = y + 4;
  };

  const paragraph = (text: string) => {
    ensure(50);
    doc
      .fillColor(ink)
      .font("Helvetica")
      .fontSize(9)
      .text(text || "Non renseigné.", 42, doc.y, {
        width: 511,
        lineGap: 3,
      });
    doc.moveDown(0.4);
  };

  const cards = (items: Array<{ label: string; value: string }>) => {
    const gap = 8;
    const width = (511 - gap * (items.length - 1)) / items.length;
    const height = 54;
    ensure(height + 8);
    items.forEach((item, index) => {
      const x = 42 + index * (width + gap);
      doc.roundedRect(x, doc.y, width, height, 5).fill("#eef4ef");
      doc
        .fillColor(muted)
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(item.label.toUpperCase(), x + 8, doc.y + 9, {
          width: width - 16,
          ellipsis: true,
        });
      doc
        .fillColor(green)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(item.value, x + 8, doc.y + 27, {
          width: width - 16,
          ellipsis: true,
        });
    });
    doc.y += height + 10;
  };

  const finish = async () => {
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(pages.start + index);
      const footerY = doc.page.height - 29;
      doc
        .strokeColor("#dfe7e1")
        .lineWidth(0.5)
        .moveTo(42, footerY - 7)
        .lineTo(553, footerY - 7)
        .stroke();
      doc.fillColor(muted).font("Helvetica").fontSize(7);
      doc.text("Compta SYCEBNL+ · Document confidentiel", 42, footerY, { lineBreak: false });
      doc.text(`Page ${index + 1} / ${pages.count}`, 475, footerY, {
        width: 78,
        align: "right",
        lineBreak: false,
      });
    }
    doc.end();
    return completed;
  };

  return { doc, section, table, paragraph, cards, newPage, finish };
}

export async function createPdfReport(
  workspace: Workspace,
  year: number,
  kind: PdfReportKind,
): Promise<Buffer> {
  const title = kind === "narrative" ? "Rapport financier narratif" : "Rapports et états";
  const pdf = createDocument(workspace, year, title);
  const entries = yearEntries(workspace.entries, year);
  const operating = operatingStatement(workspace.accounts, entries);
  const balance = balanceReport(workspace.accounts, entries);
  const employment = employmentResources(workspace.accounts, entries);

  if (kind === "narrative") {
    const metrics = narrativeMetrics(workspace, entries);
    pdf.cards([
      { label: "Ressources", value: money(metrics.resources) },
      { label: "Financements de projets", value: money(metrics.projectFunding) },
      { label: "Projets", value: String(metrics.projectsCount) },
      { label: "Résultat", value: money(operating.result) },
    ]);

    pdf.section("1. Chiffres clés", `Exercice ${year}`);
    pdf.table(
      [
        { label: "Indicateur", weight: 2 },
        { label: "Montant", weight: 1, align: "right" },
      ],
      [
        ["Produits de l’exercice", money(operating.totalProducts)],
        ["Charges de l’exercice", money(operating.totalCharges)],
        ["Excédent / déficit", money(operating.result)],
        ["Contributions volontaires valorisées", money(metrics.volunteers)],
        ["Cotisations des membres", money(metrics.membership)],
        ["Partenaires financiers", String(metrics.partnersCount)],
      ],
    );

    pdf.section("2. Financements affectés aux projets");
    pdf.table(
      [
        { label: "Compte", weight: 0.7 },
        { label: "Source", weight: 2 },
        { label: "Montant", weight: 1, align: "right" },
      ],
      metrics.sources.map((row) => [row.number, row.label, money(row.amount)]),
    );
    if (!metrics.sources.length)
      pdf.paragraph("Aucun financement de projet n’a été comptabilisé sur cet exercice.");

    pdf.section("3. Projets et réalisations");
    if (!metrics.byProject.length)
      pdf.paragraph("Aucun projet n’est enregistré pour cet exercice.");
    for (const { project, expenses } of metrics.byProject) {
      pdf.table(
        [
          { label: "Projet", weight: 2 },
          { label: "Partenaire", weight: 1.4 },
          { label: "Dépenses", weight: 1, align: "right" },
        ],
        [[`${project.code} · ${project.title}`, project.partner || "—", money(expenses)]],
      );
      pdf.paragraph(project.highlights || "Réalisations à compléter.");
    }

    pdf.section("4. Contributions volontaires et cotisations");
    pdf.table(
      [
        { label: "Rubrique", weight: 2 },
        { label: "Montant", weight: 1, align: "right" },
        { label: "Affectation", weight: 3 },
      ],
      [
        [
          "Contributions volontaires valorisées",
          money(metrics.volunteers),
          workspace.reportSettings.volunteerUse || "À compléter",
        ],
        [
          "Cotisations des membres",
          money(metrics.membership),
          workspace.reportSettings.membershipUse || "À compléter",
        ],
      ],
    );

    pdf.section("5. Perspectives");
    pdf.paragraph(workspace.reportSettings.perspectives || "Perspectives à compléter.");
  } else {
    pdf.cards([
      { label: "Produits", value: money(operating.totalProducts) },
      { label: "Charges", value: money(operating.totalCharges) },
      { label: "Résultat", value: money(operating.result) },
      { label: "Écritures", value: String(entries.length) },
    ]);

    pdf.section("Balance générale", `Mouvements de l’exercice ${year}`);
    pdf.table(
      [
        { label: "Compte", weight: 0.7 },
        { label: "Libellé", weight: 2.2 },
        { label: "Débit", weight: 1, align: "right" },
        { label: "Crédit", weight: 1, align: "right" },
        { label: "Solde débiteur", weight: 1.1, align: "right" },
        { label: "Solde créditeur", weight: 1.1, align: "right" },
      ],
      [
        ...balance.rows.map((row) => [
          row.number,
          row.label,
          money(row.debit),
          money(row.credit),
          money(row.debitBalance),
          money(row.creditBalance),
        ]),
        [
          "",
          "Totaux",
          money(balance.totalDebit),
          money(balance.totalCredit),
          money(balance.totalDebitBalance),
          money(balance.totalCreditBalance),
        ],
      ],
    );
    if (!balance.rows.length) pdf.paragraph("Aucun mouvement comptable sur cet exercice.");

    pdf.section("Compte d’exploitation");
    pdf.table(
      [
        { label: "Nature", weight: 0.8 },
        { label: "Compte", weight: 0.7 },
        { label: "Libellé", weight: 2 },
        { label: "Montant", weight: 1, align: "right" },
      ],
      [
        ...operating.products.map((row) => ["Produit", row.number, row.label, money(row.amount)]),
        ...operating.charges.map((row) => ["Charge", row.number, row.label, money(row.amount)]),
        ["Total", "", "Résultat de l’exercice", money(operating.result)],
      ],
    );

    pdf.section("Emplois et ressources");
    pdf.table(
      [
        { label: "Rubrique", weight: 2.5 },
        { label: "Nature", weight: 1 },
        { label: "Montant", weight: 1, align: "right" },
      ],
      [
        ...employment.rows.map((row) => [row.label, row.type, money(row.amount)]),
        ["Total des ressources", "Ressources", money(employment.resources)],
        ["Total des emplois", "Emplois", money(employment.jobs)],
        ["Solde ressources − emplois", "Solde", money(employment.balance)],
      ],
    );

    pdf.section("Suivi budgétaire par projet");
    if (!workspace.projects.length) pdf.paragraph("Aucun projet n’est enregistré.");
    for (const project of workspace.projects) {
      pdf.table(
        [
          { label: "Projet / ligne de dépense", weight: 2.5 },
          { label: "Budget", weight: 1, align: "right" },
          { label: "Réalisé", weight: 1, align: "right" },
          { label: "Reste", weight: 1, align: "right" },
        ],
        [
          [`${project.code} · ${project.title}`, "", "", ""],
          ...projectBudget(project, entries).details.map((line) => [
            line.label,
            money(line.budget),
            money(line.realized),
            money(line.remaining),
          ]),
        ],
      );
    }

    pdf.section("Rapprochements bancaires");
    pdf.table(
      [
        { label: "Compte", weight: 0.8 },
        { label: "Date du relevé", weight: 1 },
        { label: "Solde du relevé", weight: 1.2, align: "right" },
        { label: "Solde théorique", weight: 1.2, align: "right" },
        { label: "Écart", weight: 1, align: "right" },
      ],
      workspace.reconciliations.map((item) => {
        const result = reconcileAccount(workspace, item);
        return [
          item.accountNumber,
          displayDate(item.asOf),
          money(item.statementBalance),
          money(result.theoretical),
          money(result.difference),
        ];
      }),
    );
    if (!workspace.reconciliations.length)
      pdf.paragraph("Aucun rapprochement bancaire n’a été enregistré.");
  }

  return pdf.finish();
}
