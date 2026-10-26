using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

public class RenderEr
{
    public static void Main(string[] args)
    {
        string outputPath = args.Length > 0 ? args[0] : "docs/progetto/schema_er_concettuale.png";

        int width = 2200;
        int height = 1400;

        using (Bitmap bmp = new Bitmap(width, height))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            g.Clear(Color.FromArgb(248, 250, 252)); // slate-50

            using (Font fontTitle = new Font("Segoe UI", 22, FontStyle.Bold))
            using (Font fontSubTitle = new Font("Segoe UI", 13, FontStyle.Regular))
            using (Font fontHeader = new Font("Segoe UI", 14, FontStyle.Bold))
            using (Font fontAttr = new Font("Segoe UI", 11, FontStyle.Regular))
            using (Font fontAttrPK = new Font("Segoe UI", 11, FontStyle.Bold))
            using (Font fontRel = new Font("Segoe UI", 11, FontStyle.Bold))
            using (Font fontCard = new Font("Segoe UI", 11, FontStyle.Bold))
            using (Font fontLegend = new Font("Segoe UI", 11, FontStyle.Regular))
            using (Font fontLegendBold = new Font("Segoe UI", 11, FontStyle.Bold))
            using (Pen penBorder = new Pen(Color.FromArgb(148, 163, 184), 1.5f))
            using (Pen penLine = new Pen(Color.FromArgb(71, 85, 105), 2.5f))
            using (Pen penRel = new Pen(Color.FromArgb(37, 99, 235), 2.0f))
            using (SolidBrush brushText = new SolidBrush(Color.FromArgb(15, 23, 42)))
            using (SolidBrush brushWhite = new SolidBrush(Color.White))
            using (SolidBrush brushMuted = new SolidBrush(Color.FromArgb(100, 116, 139)))
            using (SolidBrush brushHeader = new SolidBrush(Color.FromArgb(30, 41, 59)))
            using (SolidBrush brushRelBg = new SolidBrush(Color.FromArgb(239, 246, 255)))
            using (SolidBrush brushCardBg = new SolidBrush(Color.FromArgb(254, 240, 138)))
            using (SolidBrush brushCardBorder = new SolidBrush(Color.FromArgb(202, 138, 4)))
            using (SolidBrush brushCardText = new SolidBrush(Color.FromArgb(133, 77, 14)))
            using (SolidBrush brushShadow = new SolidBrush(Color.FromArgb(226, 232, 240)))
            {
                // Titolo Diagramma
                g.DrawString("La Nostra Citta, Il Nostro Futuro - Modello Concettuale Entita-Relazioni (ER)", fontTitle, brushText, 60, 40);
                g.DrawString("Schema concettuale del nucleo di dominio (da 04_MODELLO_LOGICO.md) con cardinalita min/max e relazioni associative.", fontSubTitle, brushMuted, 62, 85);

                // Helper per disegnare badge cardinalità
                Action<string, int, int> drawCardinality = (card, x, y) =>
                {
                    int bw = 54;
                    int bh = 24;
                    int rx = x - bw / 2;
                    int ry = y - bh / 2;
                    g.FillRectangle(brushCardBg, rx, ry, bw, bh);
                    using (Pen p = new Pen(brushCardBorder, 1.2f))
                    {
                        g.DrawRectangle(p, rx, ry, bw, bh);
                    }
                    StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(card, fontCard, brushCardText, new RectangleF(rx, ry, bw, bh), sf);
                };

                // Helper per disegnare rombi di relazione
                Action<string, int, int, int, int, string> drawRel = (name, cx, cy, rw, rh, extra) =>
                {
                    Point[] pts = new Point[] {
                        new Point(cx, cy - rh / 2),
                        new Point(cx + rw / 2, cy),
                        new Point(cx, cy + rh / 2),
                        new Point(cx - rw / 2, cy)
                    };
                    g.FillPolygon(brushRelBg, pts);
                    g.DrawPolygon(penRel, pts);
                    StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(name, fontRel, brushText, new RectangleF(cx - rw / 2, cy - rh / 2, rw, rh), sf);
                    if (!string.IsNullOrEmpty(extra))
                    {
                        g.DrawString(extra, fontAttr, brushMuted, cx - 45, cy + rh / 2 + 4);
                    }
                };

                // Helper per disegnare entità
                Func<string, int, int, int, string[], Rectangle> drawEntity = (name, x, y, ew, attrs) =>
                {
                    int hh = 38;
                    int lh = 24;
                    int eh = hh + attrs.Length * lh + 14;

                    // Ombra
                    g.FillRectangle(brushShadow, x + 4, y + 4, ew, eh);

                    // Sfondo e bordo
                    g.FillRectangle(brushWhite, x, y, ew, eh);
                    g.DrawRectangle(penBorder, x, y, ew, eh);

                    // Intestazione
                    g.FillRectangle(brushHeader, x, y, ew, hh);
                    StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(name, fontHeader, brushWhite, new RectangleF(x, y, ew, hh), sf);

                    // Attributi
                    int curY = y + hh + 8;
                    foreach (var a in attrs)
                    {
                        Font f = a.StartsWith("*") ? fontAttrPK : fontAttr;
                        g.DrawString(a, f, brushText, x + 14, curY);
                        curY += lh;
                    }
                    return new Rectangle(x, y, ew, eh);
                };

                // 1. Linee e Relazioni
                // UTENTE - QUARTIERE (RISIEDE_IN)
                g.DrawLine(penLine, 330, 260, 480, 260);
                drawRel("RISIEDE_IN", 405, 260, 100, 50, null);
                drawCardinality("(0,N)", 360, 230);
                drawCardinality("(0,1)", 450, 230);

                // UTENTE - SEGNALAZIONE (CREA)
                g.DrawLine(penLine, 790, 260, 1160, 260);
                drawRel("CREA", 975, 260, 110, 50, null);
                drawCardinality("(0,N)", 830, 230);
                drawCardinality("(1,1)", 1115, 230);

                // UTENTE - SEGNALAZIONE (SOSTIENE)
                Point[] ptsSostegno = new Point[] {
                    new Point(660, 530),
                    new Point(660, 620),
                    new Point(1280, 620),
                    new Point(1280, 530)
                };
                g.DrawLines(penLine, ptsSostegno);
                drawRel("SOSTIENE", 970, 620, 120, 50, "[data_sostegno]");
                drawCardinality("(0,N)", 700, 560);
                drawCardinality("(0,N)", 1235, 560);

                // SEGNALAZIONE - MEDIA (HA)
                g.DrawLine(penLine, 1500, 260, 1730, 260);
                drawRel("HA", 1615, 260, 100, 50, null);
                drawCardinality("(1,N)", 1545, 230);
                drawCardinality("(1,1)", 1685, 230);

                // SEGNALAZIONE - CATEGORIA (CLASSIFICATA_IN)
                g.DrawLine(penLine, 1380, 530, 1380, 820);
                drawRel("CLASSIFICATA_IN", 1380, 675, 150, 55, null);
                drawCardinality("(0,N)", 1420, 570);
                drawCardinality("(0,N)", 1420, 780);

                // SEGNALAZIONE - EVENTO_STATO (HA_STORIA)
                Point[] ptsStoria = new Point[] {
                    new Point(1190, 530),
                    new Point(1190, 730),
                    new Point(780, 730),
                    new Point(780, 820)
                };
                g.DrawLines(penLine, ptsStoria);
                drawRel("HA_STORIA", 985, 730, 120, 50, null);
                drawCardinality("(1,N)", 1180, 570);
                drawCardinality("(1,1)", 780, 780);

                // UTENTE - EVENTO_STATO (ESEGUE)
                g.DrawLine(penLine, 560, 530, 560, 820);
                drawRel("ESEGUE", 560, 680, 110, 50, null);
                drawCardinality("(0,N)", 600, 570);
                drawCardinality("(0,1)", 600, 780);

                // 2. Entità
                drawEntity("QUARTIERE", 70, 170, 260, new string[] {
                    "* id (PK)",
                    "nome (UQ)"
                });

                drawEntity("UTENTE", 480, 170, 310, new string[] {
                    "* id (PK)",
                    "nome",
                    "cognome",
                    "email_normalizzata (UQ)",
                    "password_hash",
                    "codice_fiscale (UQ)",
                    "ruolo (CITTADINO, COMITATO)",
                    "stato_account (ATTIVO, SOSPESO)",
                    "verificato_il (data/ora)",
                    "creato_il (timestamp)"
                });

                drawEntity("SEGNALAZIONE", 1160, 170, 340, new string[] {
                    "* id (PK)",
                    "descrizione (testo)",
                    "latitudine, longitudine",
                    "origine_posizione (MANUALE, EXIF)",
                    "stato_avanzamento",
                    "stato_moderazione",
                    "revisione (intero positivo)",
                    "creata_il (timestamp)",
                    "aggiornata_il (timestamp)"
                });

                drawEntity("MEDIA", 1730, 170, 320, new string[] {
                    "* id (PK)",
                    "storage_key (UQ)",
                    "tipo (FOTO, VIDEO)",
                    "mime (tipo MIME)",
                    "byte_size (intero > 0)",
                    "durata_secondi (video)",
                    "sha256 (hash binario)",
                    "stato_file (READY, QUARANTENA)",
                    "exif_lat, exif_lon",
                    "derivato_key (UQ)"
                });

                drawEntity("CATEGORIA", 1230, 820, 300, new string[] {
                    "* id (PK)",
                    "codice (UQ)",
                    "nome (stringa)",
                    "attiva (booleano)"
                });

                drawEntity("EVENTO_STATO", 460, 820, 360, new string[] {
                    "* id (PK)",
                    "tipo_attore (UTENTE, SISTEMA)",
                    "ambito (AVANZAMENTO, MODERAZIONE)",
                    "da_stato (stato precedente)",
                    "a_stato (nuovo stato)",
                    "motivazione (stringa)",
                    "revisione (riferimento)",
                    "creato_il (timestamp)"
                });

                // 3. Legenda
                int lx = 1660, ly = 820, lw = 460, legHeight = 370;
                g.FillRectangle(brushShadow, lx + 4, ly + 4, lw, legHeight);
                g.FillRectangle(brushWhite, lx, ly, lw, legHeight);
                g.DrawRectangle(penBorder, lx, ly, lw, legHeight);
                g.FillRectangle(brushHeader, lx, ly, lw, 36);
                StringFormat sfLeg = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString("LEGENDA E CONVENZIONI ER", fontHeader, brushWhite, new RectangleF(lx, ly, lw, 36), sfLeg);

                int cyLeg = ly + 52;
                g.FillRectangle(brushHeader, lx + 24, cyLeg, 40, 22);
                g.DrawString("Rettangolo:", fontLegendBold, brushText, lx + 74, cyLeg + 2);
                g.DrawString("Entita concettuale di dominio", fontLegend, brushMuted, lx + 165, cyLeg + 2);

                cyLeg += 34;
                Point[] rhLeg = new Point[] {
                    new Point(lx + 44, cyLeg),
                    new Point(lx + 64, cyLeg + 11),
                    new Point(lx + 44, cyLeg + 22),
                    new Point(lx + 24, cyLeg + 11)
                };
                g.FillPolygon(brushRelBg, rhLeg);
                g.DrawPolygon(penRel, rhLeg);
                g.DrawString("Rombo:", fontLegendBold, brushText, lx + 74, cyLeg + 2);
                g.DrawString("Relazione tra entita", fontLegend, brushMuted, lx + 140, cyLeg + 2);

                cyLeg += 34;
                g.FillRectangle(brushCardBg, lx + 24, cyLeg, 45, 22);
                using (Pen p = new Pen(brushCardBorder, 1.2f)) { g.DrawRectangle(p, lx + 24, cyLeg, 45, 22); }
                g.DrawString("(m,M)", fontCard, brushCardText, new RectangleF(lx + 24, cyLeg, 45, 22), sfLeg);
                g.DrawString("Badge:", fontLegendBold, brushText, lx + 74, cyLeg + 2);
                g.DrawString("Cardinalita della partecipazione (min, max)", fontLegend, brushMuted, lx + 130, cyLeg + 2);

                cyLeg += 32;
                using (Pen p = new Pen(Color.FromArgb(226, 232, 240), 1.0f)) { g.DrawLine(p, lx + 24, cyLeg, lx + lw - 24, cyLeg); }

                cyLeg += 14;
                g.DrawString("* id (PK):", fontLegendBold, brushText, lx + 24, cyLeg);
                g.DrawString("Identificatore univoco essenziale", fontLegend, brushMuted, lx + 100, cyLeg);

                cyLeg += 26;
                g.DrawString("(UQ):", fontLegendBold, brushText, lx + 24, cyLeg);
                g.DrawString("Valore a unicita obbligatoria", fontLegend, brushMuted, lx + 70, cyLeg);

                cyLeg += 26;
                g.DrawString("[attributo]:", fontLegendBold, brushText, lx + 24, cyLeg);
                g.DrawString("Attributo proprio della relazione", fontLegend, brushMuted, lx + 110, cyLeg);

                cyLeg += 32;
                g.DrawString("Nel Modello Logico (04_MODELLO_LOGICO.md):", fontLegendBold, brushText, lx + 24, cyLeg);
                cyLeg += 22;
                g.DrawString("- SOSTIENE diviene tabella ponte SOSTEGNO", fontLegend, brushMuted, lx + 30, cyLeg);
                cyLeg += 20;
                g.DrawString("- CLASSIFICATA_IN diviene SEGNALAZIONE_CATEGORIA", fontLegend, brushMuted, lx + 30, cyLeg);

                // Note a fondo pagina
                g.DrawString("Nota di conformita: Le tabelle tecniche (AnalisiIA, Outbox, TokenAccount, Sessione, AuditEvento, UploadTemporaneo) appartengono all'estensione implementativa (04_MODELLO_LOGICO.md) e non alterano il modello concettuale.", fontSubTitle, brushMuted, 60, 1345);
            }

            bmp.Save(outputPath, ImageFormat.Png);
            Console.WriteLine("PNG generato con successo: " + outputPath);
        }
    }
}
