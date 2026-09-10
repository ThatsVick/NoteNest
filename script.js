// =======================================================================================================================
// GLOBALE VARIABLEN
// =======================================================================================================================

let currentEditId = null;            // Speichert die ID der Notiz beim Bearbeiten/Zwischenspeichern
let currentCalendarDate = new Date(); // Speichert das aktuell im Kalender angezeigte Datum
let quill = null;                    // Hält die globale Instanz des Quill.js Texteditors

// =======================================================================================================================
// CUSTOM QUILL EMBEDMENT REGISTRIEREN (Erzwingt Icon-Größe für Bilder im Text)
// =======================================================================================================================

function registerQuillImageIcon() {
    if (typeof Quill !== 'undefined') {
        const Embed = Quill.import('blots/embed');

        class InlineImageIcon extends Embed {
            static create(value) {
                const node = super.create();
                node.setAttribute('src', value);
                node.setAttribute('class', 'text-inline-icon');
                node.style.cssText = 'height:1.2em; width:auto; vertical-align:middle; margin:0 3px; border-radius:3px; cursor:pointer; display:inline-block;';
                node.setAttribute('title', 'Klicken für Großansicht');
                return node;
            }

            static value(node) {
                return node.getAttribute('src');
            }
        }

        InlineImageIcon.blotName = 'inlineIcon';
        InlineImageIcon.tagName = 'img';
        Quill.register(InlineImageIcon);
    }
}

// =======================================================================================================================
// 1. INITIALISIERUNG BEIM LADEN DER SEITE
// =======================================================================================================================

async function initApp() {
    const datumInput = document.getElementById('datum');
    const quillContainer = document.getElementById('editorText');
    
    registerQuillImageIcon();

    if (quillContainer && typeof Quill !== 'undefined') {
        quill = new Quill('#editorText', {
            theme: 'snow',
            placeholder: 'Hier schreiben...',
            modules: {
                toolbar: [
                    [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['image', 'clean']
                ]
            }
        });

        const toolbar = quill.getModule('toolbar');
        toolbar.addHandler('image', function() {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.onchange = () => {
                if (input.files && input.files[0]) {
                    insertCompressedImageIcon(input.files[0]);
                }
            };
            input.click();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    if (editId) {
        currentEditId = parseInt(editId, 10);
        await loadEntryForEditing(currentEditId);
    } else if (datumInput && !datumInput.value) {
        datumInput.value = new Date().toISOString().split('T')[0];
    }

    if (!document.getElementById('imageModalOverlay')) {
        const modal = document.createElement('div');
        modal.id = 'imageModalOverlay';
        modal.style.cssText = 'display:none; position:fixed; z-index:10000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; cursor:pointer;';
        
        modal.innerHTML = `
            <div onclick="event.stopPropagation();">
                <img id="imageModalImg" style="max-width:90vw; max-height:90vh; border-radius:8px; box-shadow:0 5px 15px rgba(0,0,0,0.5); display:block;">
            </div>
        `;
        
        modal.onclick = function() { 
            modal.style.display = 'none'; 
        };
        
        document.body.appendChild(modal);
    }

    await updateArchiveCount();
    renderCssGuide();
    await renderStartDashboard();
    await renderCalendar();
}

async function getArchiveData() {
    if (typeof localforage !== 'undefined') {
        const data = await localforage.getItem('myFolderArchive');
        return data || [];
    }
    return JSON.parse(localStorage.getItem('myFolderArchive')) || [];
}

async function setArchiveData(archive) {
    if (typeof localforage !== 'undefined') {
        await localforage.setItem('myFolderArchive', archive);
    } else {
        localStorage.setItem('myFolderArchive', JSON.stringify(archive));
    }
}

document.addEventListener("DOMContentLoaded", initApp);
window.addEventListener("pageshow", function() {
    renderStartDashboard();
});

document.addEventListener('click', function(e) {
    if (e.target && e.target.tagName === 'IMG' && (e.target.classList.contains('text-inline-icon') || e.target.style.height === '1.2em')) {
        e.stopPropagation();
        openImageModal(e.target.src);
    }
});

function openImageModal(src) {
    const modal = document.getElementById('imageModalOverlay');
    const modalImg = document.getElementById('imageModalImg');
    
    if (modal && modalImg) {
        modalImg.src = src;
        modal.style.display = 'flex';
    }
}

// =======================================================================================================================
// BILD-KOMPRIMIERUNG & EINFÜGEN ALS TEXT-ICON
// =======================================================================================================================

function compressImage(file, maxWidth, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(compressedDataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function insertCompressedImageIcon(file) {
    compressImage(file, 1500, 0.75, function(imgSrc) {
        if (quill) {
            let range = quill.getSelection(true);
            if (!range) {
                range = { index: quill.getLength(), length: 0 };
            }

            quill.insertEmbed(range.index, 'inlineIcon', imgSrc, Quill.sources.USER);
            quill.setSelection(range.index + 1, Quill.sources.SILENT);
        }
    });
}

// =======================================================================================================================
// 2. DASHBOARD-FUNKTIONEN (Start.html)
// =======================================================================================================================

async function renderStartDashboard() {
    const listContainer = document.getElementById('recentNotesList');
    if (!listContainer) return;

    const archive = await getArchiveData();

    if (archive.length === 0) {
        listContainer.innerHTML = '<li><p style="color: #666;">Noch keine Notizen im Archiv vorhanden.</p></li>';
        return;
    }

    const sortedNotes = [...archive].sort((a, b) => b.id - a.id);
    const recentNotes = sortedNotes.slice(0, 3);

    listContainer.innerHTML = recentNotes.map(note => `
        <li>
            <span class="list-date">📅 ${note.date} ${note.tags ? '• 🏷️ ' + note.tags : ''}</span>
            <p><strong>${note.title}</strong></p>
        </li>
    `).join('');
}

// =======================================================================================================================
// 3. EDITOR-FUNKTIONEN & SPEICHERN MIT ZWISCHENSPEICHERUNG (Neu.html)
// =======================================================================================================================

async function loadEntryForEditing(id) {
    const archive = await getArchiveData();
    const entry = archive.find(item => item.id === id);

    if (entry) {
        if (document.getElementById('datum')) document.getElementById('datum').value = entry.date;
        if (document.getElementById('thema')) document.getElementById('thema').value = entry.title;
        if (document.getElementById('tags')) document.getElementById('tags').value = entry.tags;
        
        if (quill) {
            quill.root.innerHTML = entry.content;
        }

        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) saveBtn.innerText = "Änderung speichern";
    }
}

async function saveToArchive() {
    const datum = document.getElementById('datum').value;
    const thema = document.getElementById('thema').value.trim() || 'Unbenanntes Thema';
    const tags = document.getElementById('tags').value.trim();
    
    const inhalt = quill ? quill.root.innerHTML : '';

    if (!quill || quill.getText().trim().length === 0) {
        alert("Bitte schreibe zuerst einen Text!");
        return;
    }

    try {
        let archive = await getArchiveData();

        if (currentEditId) {
            const index = archive.findIndex(item => item.id === currentEditId);
            if (index !== -1) {
                archive[index] = {
                    id: currentEditId,
                    date: datum,
                    title: thema,
                    tags: tags,
                    content: inhalt
                };
            }
        } else {
            currentEditId = Date.now();
            const newEntry = {
                id: currentEditId,
                date: datum,
                title: thema,
                tags: tags,
                content: inhalt
            };
            archive.push(newEntry);
        }

        await setArchiveData(archive);
        await renderStartDashboard();

        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.innerText = "Änderung speichern";
        }

        alert("Erfolgreich gespeichert!");
    } catch (e) {
        console.error("Speicherfehler:", e);
        alert("Fehler beim Speichern: " + e.message);
    }
}

// =======================================================================================================================
// 4. ARCHIV-FUNKTIONEN MIT AUTOMATISCHEN MONATS-ORDNERN (Ordner.html)
// =======================================================================================================================

async function updateArchiveCount() {
    const archive = await getArchiveData();
    const countInfo = document.getElementById('archiveCountInfo');
    if (countInfo) {
        countInfo.innerText = archive.length + (archive.length === 1 ? " Eintrag" : " Einträge");
    }
}

async function openArchiveView() {
    const archiveSec = document.getElementById('archiveSection');
    const cssSec = document.getElementById('cssGuideSection');

    if (cssSec) cssSec.style.display = "none";
    if (archiveSec) {
        archiveSec.style.display = "block";
        await loadArchive();
        archiveSec.scrollIntoView({ behavior: 'smooth' });
    }
}

function openCssGuideView() {
    const archiveSec = document.getElementById('archiveSection');
    const cssSec = document.getElementById('cssGuideSection');

    if (archiveSec) archiveSec.style.display = "none";
    if (cssSec) {
        cssSec.style.display = "block";
        renderCssGuide();
        cssSec.scrollIntoView({ behavior: 'smooth' });
    }
}

function getMonthYearLabel(dateString) {
    if (!dateString) return "Unbekannter Monat";
    const parts = dateString.split('-');
    if (parts.length < 2) return "Unbekannter Monat";

    const monthNames = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parts[0];

    return `${monthNames[monthIndex] || 'Unbekannt'} ${year}`;
}

async function loadArchive() {
    const container = document.getElementById('archiveContainer');
    if (!container) return;

    const archive = await getArchiveData();

    if (archive.length === 0) {
        container.innerHTML = "<p style='color: #666;'>Noch keine Einträge im Archiv vorhanden.</p>";
        return;
    }

    const sortSelect = document.getElementById('sortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'date-desc';

    archive.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        switch (sortValue) {
            case 'date-asc': return new Date(a.date) - new Date(b.date);
            case 'date-desc': return new Date(b.date) - new Date(a.date);
            case 'title-asc': return titleA.localeCompare(titleB);
            case 'title-desc': return titleB.localeCompare(titleA);
            default: return new Date(b.date) - new Date(a.date);
        }
    });

    const monthGroups = {};
    archive.forEach(item => {
        const label = getMonthYearLabel(item.date);
        if (!monthGroups[label]) {
            monthGroups[label] = [];
        }
        monthGroups[label].push(item);
    });

    let folderIdx = 0;
    container.innerHTML = Object.keys(monthGroups).map(monthLabel => {
        const items = monthGroups[monthLabel];
        folderIdx++;

        return `
            <div class="month-folder-card" style="background: #fff; border: 1px solid #007bff; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                
                <div onclick="toggleMonthFolder(${folderIdx})" style="padding: 12px 15px; background: #e9f2ff; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 16px; color: #007bff;">📁 ${monthLabel}</h3>
                    <span id="month-folder-icon-${folderIdx}" style="font-size: 13px; color: #007bff; font-weight: bold;">▼ (${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'})</span>
                </div>

                <div id="month-folder-body-${folderIdx}" class="month-folder-body" style="display: none; padding: 15px; background: #fafafa; border-top: 1px solid #d0e3ff;">
                    ${items.map(item => `
                        <div class="archive-card" data-tags="${item.tags || ''}" data-title="${item.title}" data-date="${item.date || ''}" style="background: #fff; border-left: 4px solid #007bff; margin-bottom: 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
                            <div style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
                                <div onclick="toggleContent(${item.id})" style="cursor: pointer; display: flex; align-items: center; gap: 12px; flex-grow: 1;">
                                    <span style="font-size: 12px; font-weight: bold; color: #555;">📅 ${item.date}</span>
                                    <h4 style="margin: 0; font-size: 15px; color: #222;">${item.title}</h4>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span onclick="toggleContent(${item.id})" style="cursor: pointer; font-size: 11px; background: #e9f2ff; color: #007bff; padding: 2px 6px; border-radius: 4px;">🏷️ ${item.tags || 'Keine Tags'}</span>
                                    <button onclick="event.stopPropagation(); editEntry(${item.id});" title="Bearbeiten" style="background: transparent; border: none; cursor: pointer; font-size: 15px;">✏️</button>
                                    <button onclick="event.stopPropagation(); deleteEntry(${item.id});" title="Löschen" style="background: transparent; border: none; cursor: pointer; font-size: 15px;">🗑️</button>
                                    <span onclick="toggleContent(${item.id})" id="icon-${item.id}" style="cursor: pointer; font-size: 12px; color: #888; width: 15px; text-align: center;">▼</span>
                                </div>
                            </div>
                            <div id="body-${item.id}" style="display: none; padding: 12px; border-top: 1px solid #eee; background: #fff;">
                                <div style="font-size: 14px; color: #333; line-height: 1.5;">${item.content}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>

            </div>
        `;
    }).join('');

    if (typeof filterArchive === "function") {
        filterArchive();
    }
}

function toggleMonthFolder(idx) {
    const body = document.getElementById(`month-folder-body-${idx}`);
    const icon = document.getElementById(`month-folder-icon-${idx}`);

    if (!body) return;

    if (body.style.display === "none") {
        body.style.display = "block";
        if (icon) icon.innerText = icon.innerText.replace("▼", "▲");
    } else {
        body.style.display = "none";
        if (icon) icon.innerText = icon.innerText.replace("▲", "▼");
    }
}

function toggleContent(id) {
    const body = document.getElementById(`body-${id}`);
    const icon = document.getElementById(`icon-${id}`);

    if (body.style.display === "none") {
        body.style.display = "block";
        if (icon) icon.innerText = "▲";
    } else {
        body.style.display = "none";
        if (icon) icon.innerText = "▼";
    }
}

function filterArchive() {
    const searchInput = document.getElementById('tagSearchInput');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    const folderCards = document.querySelectorAll('.month-folder-card');

    folderCards.forEach((folderCard, idx) => {
        const body = folderCard.querySelector('.month-folder-body');
        const icon = document.getElementById(`month-folder-icon-${idx + 1}`);
        const cards = folderCard.querySelectorAll('.archive-card');
        let hasMatchInFolder = false;

        cards.forEach(card => {
            const tags = (card.getAttribute('data-tags') || '').toLowerCase();
            const title = (card.getAttribute('data-title') || '').toLowerCase();
            const date = (card.getAttribute('data-date') || '').toLowerCase();

            let germanDate = "";
            if (date && date.includes('-')) {
                const parts = date.split('-');
                if (parts.length === 3) {
                    germanDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                }
            }

            if (!query || tags.includes(query) || title.includes(query) || date.includes(query) || germanDate.includes(query)) {
                card.style.display = "block";
                if (query) hasMatchInFolder = true;
            } else {
                card.style.display = "none";
            }
        });

        if (query) {
            if (hasMatchInFolder) {
                folderCard.style.display = "block";
                if (body) body.style.display = "block";
                if (icon) icon.innerText = icon.innerText.replace("▼", "▲");
            } else {
                folderCard.style.display = "none";
            }
        } else {
            folderCard.style.display = "block";
            if (body) body.style.display = "none";
            if (icon) icon.innerText = icon.innerText.replace("▲", "▼");
        }
    });
}

async function deleteEntry(id) {
    if (confirm("Eintrag wirklich löschen?")) {
        let archive = await getArchiveData();
        archive = archive.filter(item => item.id !== id);
        await setArchiveData(archive);
        await loadArchive();
        await updateArchiveCount();
        await renderStartDashboard();
    }
}

function editEntry(id) {
    window.location.href = `Neu.html?edit=${id}`;
}

// =======================================================================================================================
// 5. CSS-HANDBUCH UND LERNDATENBANK
// =======================================================================================================================

const cssDatabase = [
    {
        category: "Border & Rahmen",
        icon: "🔲",
        commands: [
            { name: "border", syntax: "border: 1px solid #000;", desc: "Kurzform für Breite, Stil und Farbe des Außenrahmens." },
            { name: "border-width", syntax: "border-width: 2px;", desc: "Bestimmt die Dicke des Außenrahmens." },
            { name: "border-style", syntax: "border-style: solid | dashed | dotted | double | groove | ridge | inset | outset;", desc: "Legt den Rahmentyp fest." },
            { name: "border-color", syntax: "border-color: #007bff;", desc: "Bestimmt die Farbe des Rahmens." },
            { name: "border-radius", syntax: "border-radius: 8px | 50%;", desc: "Ründet die Ecken ab (z.B. 50% für Kreise)." },
            { name: "border-top / bottom / left / right", syntax: "border-bottom: 2px solid #000;", desc: "Setzt den Rahmen gezielt nur an eine bestimmte Seite." },
            { name: "border-image", syntax: "border-image: url(border.png) 30 round;", desc: "Verwendet ein Bild als Rahmen." },
            { name: "outline", syntax: "outline: 2px dashed red;", desc: "Zeichnet eine Linie außerhalb des Rahmens (ohne Platz im Layout zu verbrauchen)." },
            { name: "outline-offset", syntax: "outline-offset: 4px;", desc: "Bestimmt den Abstand zwischen Outline und Elementrahmen." }
        ]
    },
    {
        category: "Abstände & Box-Modell",
        icon: "📦",
        commands: [
            { name: "margin", syntax: "margin: 10px 20px 10px 20px;", desc: "Außenabstand zu anderen Elementen (oben rechts unten links)." },
            { name: "margin-top / right / bottom / left", syntax: "margin-top: 15px;", desc: "Gezielter Außenabstand an einer Seite." },
            { name: "padding", syntax: "padding: 15px;", desc: "Innenabstand zwischen Rahmen und dem Inhalt." },
            { name: "padding-top / right / bottom / left", syntax: "padding-left: 20px;", desc: "Gezielter Innenabstand an einer Seite." },
            { name: "width / height", syntax: "width: 100px; height: 50px;", desc: "Bestimmt feste Breite und Höhe eines Elements." },
            { name: "min-width / max-width", syntax: "max-width: 1200px;", desc: "Setzt minimale und maximale Breitenbegrenzungen." },
            { name: "min-height / max-height", syntax: "min-height: 100vh;", desc: "Setzt minimale und maximale Höhenbegrenzungen." },
            { name: "box-sizing", syntax: "box-sizing: border-box | content-box;", desc: "border-box rechnet Padding und Border in die Gesamtbreite ein." }
        ]
    },
    {
        category: "Flexbox Layout",
        icon: "📐",
        commands: [
            { name: "display: flex", syntax: "display: flex | inline-flex;", desc: "Aktiviert das flexible Layout-System für Kinderelemente." },
            { name: "flex-direction", syntax: "flex-direction: row | column | row-reverse | column-reverse;", desc: "Bestimmt die Hauptachse (nebeneinander oder untereinander)." },
            { name: "justify-content", syntax: "justify-content: flex-start | flex-end | center | space-between | space-around | space-evenly;", desc: "Richtet Elemente auf der Hauptachse aus." },
            { name: "align-items", syntax: "align-items: stretch | flex-start | flex-end | center | baseline;", desc: "Richtet Elemente auf der Querachse (senkrecht) aus." },
            { name: "flex-wrap", syntax: "flex-wrap: nowrap | wrap | wrap-reverse;", desc: "Ermöglicht den automatischen Zeilenumbruch bei Platzmangel." },
            { name: "flex-flow", syntax: "flex-flow: row wrap;", desc: "Kurzform für flex-direction und flex-wrap." },
            { name: "align-content", syntax: "align-content: space-between | center;", desc: "Richtet mehrere Flex-Zeilen untereinander aus." },
            { name: "gap", syntax: "gap: 15px 20px;", desc: "Bestimmt den Abstand zwischen Flex- oder Grid-Elementen." },
            { name: "flex-grow", syntax: "flex-grow: 1;", desc: "Bestimmt, wie stark ein Element wächst, um freien Platz zu füllen." },
            { name: "flex-shrink", syntax: "flex-shrink: 1;", desc: "Bestimmt, wie stark ein Element bei Platzmangel schrumpft." },
            { name: "flex-basis", syntax: "flex-basis: 200px | auto;", desc: "Legt die Ausgangsgröße eines Flex-Elements vor dem Verteilen fest." },
            { name: "order", syntax: "order: 1;", desc: "Ändert die visuelle Reihenfolge von einzelnen Flex-Elementen." }
        ]
    },
    {
        category: "CSS Grid Layout",
        icon: "🏁",
        commands: [
            { name: "display: grid", syntax: "display: grid | inline-grid;", desc: "Aktiviert das zweidimensionale Raster-Layout." },
            { name: "grid-template-columns", syntax: "grid-template-columns: repeat(3, 1fr) | 200px 1fr;", desc: "Definiert die Anzahl und Breite der Spalten." },
            { name: "grid-template-rows", syntax: "grid-template-rows: auto 1fr 100px;", desc: "Definiert die Höhe der Zeilen im Grid." },
            { name: "grid-template-areas", syntax: "grid-template-areas: 'header header' 'sidebar main';", desc: "Ermöglicht benannte Layout-Bereiche." },
            { name: "grid-column", syntax: "grid-column: 1 / 3 | span 2;", desc: "Bestimmt, über wie viele Spalten sich ein Element erstreckt." },
            { name: "grid-row", syntax: "grid-row: 1 / span 2;", desc: "Bestimmt, über wie viele Zeilen sich ein Element erstreckt." },
            { name: "justify-items", syntax: "justify-items: start | end | center | stretch;", desc: "Richtet Grid-Inhalte waagerecht innerhalb ihrer Zelle aus." },
            { name: "align-items (Grid)", syntax: "align-items: start | end | center | stretch;", desc: "Richtet Grid-Inhalte senkrecht innerhalb ihrer Zelle aus." }
        ]
    },
    {
        category: "Text & Typografie",
        icon: "✍️",
        commands: [
            { name: "color", syntax: "color: #333333 | rgb(0,0,0) | hsl(0, 0%, 20%);", desc: "Bestimmt die Textfarbe." },
            { name: "font-family", syntax: "font-family: 'Lobster', Arial, sans-serif;", desc: "Legt die Schriftart und Ersatz-Schriftarten fest." },
            { name: "font-size", syntax: "font-size: 16px | 1.2rem | 12pt;", desc: "Legt die Schriftgröße fest." },
            { name: "font-weight", syntax: "font-weight: normal | bold | 100..900;", desc: "Bestimmt die Schriftstärke." },
            { name: "font-style", syntax: "font-style: normal | italic | oblique;", desc: "Stellt Text kursiv." },
            { name: "text-align", syntax: "text-align: left | center | right | justify;", desc: "Richtet den Text aus (z.B. Blocksatz)." },
            { name: "text-decoration", syntax: "text-decoration: underline | line-through | none;", desc: "Unterstreicht oder streicht Text durch." },
            { name: "text-transform", syntax: "text-transform: uppercase | lowercase | capitalize;", desc: "Konvertiert Text in Groß- oder Kleinbuchstaben." },
            { name: "line-height", syntax: "line-height: 1.5 | 24px;", desc: "Bestimmt den Zeilenabstand im Text." },
            { name: "letter-spacing", syntax: "letter-spacing: 2px;", desc: "Bestimmt den Abstand zwischen einzelnen Buchstaben." },
            { name: "word-spacing", syntax: "word-spacing: 5px;", desc: "Bestimmt den Abstand zwischen Wörtern." },
            { name: "text-shadow", syntax: "text-shadow: 2px 2px 4px rgba(0,0,0,0.5);", desc: "Fügt dem Text einen Schatten hinzu." },
            { name: "white-space", syntax: "white-space: nowrap | pre-wrap | normal;", desc: "Steuert den automatischen Textumbruch und Leerzeichen." },
            { name: "text-overflow", syntax: "text-overflow: ellipsis | clip;", desc: "Schneidet überstehenden Text mit '...' ab." }
        ]
    },
    {
        category: "Hintergrund & Farben",
        icon: "🎨",
        commands: [
            { name: "background-color", syntax: "background-color: #ffffff | transparent;", desc: "Bestimmt die Hintergrundfarbe." },
            { name: "background-image", syntax: "background-image: url('bild.png') | linear-gradient(...);", desc: "Setzt ein Hintergrundbild oder Farbverlauf." },
            { name: "background-repeat", syntax: "background-repeat: repeat | no-repeat | repeat-x | repeat-y;", desc: "Steuert Kacheln von Hintergrundbildern." },
            { name: "background-position", syntax: "background-position: center | top right | 50% 50%;", desc: "Positioniert das Hintergrundbild." },
            { name: "background-size", syntax: "background-size: cover | contain | 100% auto;", desc: "Skaliert das Hintergrundbild in die Box." },
            { name: "background-attachment", syntax: "background-attachment: scroll | fixed;", desc: "Fixiert das Hintergrundbild beim Scrollen (Parallax-Effekt)." },
            { name: "opacity", syntax: "opacity: 0.5 | 1;", desc: "Bestimmt die Transparenz des gesamten Elements (0 = unsichtbar, 1 = sichtbar)." }
        ]
    },
    {
        category: "Positionierung & Anzeige",
        icon: "📍",
        commands: [
            { name: "display", syntax: "display: block | inline | inline-block | none | flex | grid;", desc: "Bestimmt das Anzeige-Verhalten eines Elements." },
            { name: "position", syntax: "position: static | relative | absolute | fixed | sticky;", desc: "Bestimmt die Positionierungsart im Dokumentfluss." },
            { name: "top / right / bottom / left", syntax: "top: 10px; right: 20px;", desc: "Verschiebt positionierte Elemente um genaue Pixel/Prozentwerte." },
            { name: "z-index", syntax: "z-index: 10 | 9999;", desc: "Bestimmt die Stapelreihenfolge auf der Z-Achse (Ebenen oben/unten)." },
            { name: "overflow", syntax: "overflow: visible | hidden | scroll | auto;", desc: "Steuert das Verhalten, wenn Inhalt aus der Box herausragt." },
            { name: "float", syntax: "float: left | right | none;", desc: "Lässt Elemente von Text umfließen." },
            { name: "clear", syntax: "clear: left | right | both;", desc: "Hebt die Wirkung von Umfließungen (float) auf." },
            { name: "visibility", syntax: "visibility: visible | hidden;", desc: "Versteckt ein Element (behält den Platz im Layout jedoch bei)." }
        ]
    },
    {
        category: "Transformationen, Animationen & Effekte",
        icon: "✨",
        commands: [
            { name: "transform", syntax: "transform: rotate(45deg) scale(1.2) translate(10px, 20px);", desc: "Dreht, skaliert oder verschiebt Elemente im Raum." },
            { name: "transition", syntax: "transition: all 0.3s ease-in-out;", desc: "Steuert sanfte Übergänge von CSS-Eigenschaften (z.B. bei :hover)." },
            { name: "animation", syntax: "animation: myAnim 2s infinite alternate;", desc: "Wendet eine per @keyframes definierte Animation an." },
            { name: "box-shadow", syntax: "box-shadow: 0 4px 8px rgba(0,0,0,0.2);", desc: "Erzeugt Schattenwürfe um die Box." },
            { name: "filter", syntax: "filter: blur(5px) grayscale(100%) brightness(1.2);", desc: "Wendet grafische Effekte wie Weichzeichner oder Graustufen an." },
            { name: "backdrop-filter", syntax: "backdrop-filter: blur(10px);", desc: "Erzeugt den beliebten 'Frosted Glass'-Effekt hinter Elementen." },
            { name: "cursor", syntax: "cursor: pointer | default | move | not-allowed | grab;", desc: "Ändert die Form des Mauszeigers beim Drüberfahren." },
            { name: "pointer-events", syntax: "pointer-events: none | auto;", desc: "Deaktiviert oder aktiviert Mausreaktionen/Klicks auf dem Element." }
        ]
    }
];

function renderCssGuide() {
    const container = document.getElementById('cssGuideContainer');
    if (!container) return;

    container.innerHTML = cssDatabase.map((cat, catIdx) => `
        <div class="css-category-card" style="background: #fff; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div onclick="toggleCssCategory(${catIdx})" style="padding: 12px 15px; background: #f8f9fa; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee;">
                <h3 style="margin: 0; font-size: 16px; color: #007bff;">${cat.icon || '📁'} ${cat.category}</h3>
                <span id="css-cat-icon-${catIdx}" style="font-size: 12px; color: #666;">▼ (${cat.commands.length} Befehle)</span>
            </div>
            
            <div id="css-cat-body-${catIdx}" class="css-cat-body" style="display: none; padding: 15px;">
                ${cat.commands.map(cmd => `
                    <div class="css-command-item" data-name="${cmd.name.toLowerCase()}" data-desc="${cmd.desc.toLowerCase()}" style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed #eee;">
                        <strong style="color: #222; font-size: 15px;">${cmd.name}</strong>
                        <pre style="background: #f4f4f4; padding: 6px 10px; border-radius: 4px; font-size: 13px; color: #d63384; margin: 5px 0;">${cmd.syntax}</pre>
                        <span style="font-size: 13px; color: #555;">${cmd.desc}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function toggleCssCategory(idx) {
    const body = document.getElementById(`css-cat-body-${idx}`);
    const icon = document.getElementById(`css-cat-icon-${idx}`);

    if (!body) return;

    if (body.style.display === "none") {
        body.style.display = "block";
        if (icon) icon.innerText = "▲ Einklappen";
    } else {
        body.style.display = "none";
        if (icon) icon.innerText = `▼ (${cssDatabase[idx].commands.length} Befehle)`;
    }
}

function searchCssGuide() {
    const searchInput = document.getElementById('cssSearchInput');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    const categoryCards = document.querySelectorAll('.css-category-card');

    categoryCards.forEach((card, idx) => {
        let hasMatch = false;
        const body = document.getElementById(`css-cat-body-${idx}`);
        const items = card.querySelectorAll('.css-command-item');

        items.forEach(item => {
            const name = item.getAttribute('data-name') || '';
            const desc = item.getAttribute('data-desc') || '';

            if (!query || name.includes(query) || desc.includes(query)) {
                item.style.display = "block";
                if (query) hasMatch = true;
            } else {
                item.style.display = "none";
            }
        });

        if (query) {
            if (hasMatch) {
                card.style.display = "block";
                if (body) body.style.display = "block";
            } else {
                card.style.display = "none";
            }
        } else {
            card.style.display = "block";
            if (body) body.style.display = "none";
        }
    });
}

// =======================================================================================================================
// 6. DYNAMISCHER KALENDER MIT KLICKBARER TAGES-DETAILANSICHT (Kalender.html)
// =======================================================================================================================

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
    closeDayDetail();
}

// Rendert das Monatsraster im Kalender (Neueste Notizen stehen auch in den Kacheln oben)
async function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthYearTitle = document.getElementById('currentMonthYear');

    if (!grid || !monthYearTitle) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];

    monthYearTitle.innerText = `${monthNames[month]} ${year}`;

    const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    let htmlContent = dayLabels.map(day => `<div class="day-label">${day}</div>`).join('');

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;

    const archive = await getArchiveData();

    for (let i = 0; i < startOffset; i++) {
        htmlContent += `<div class="calendar-day empty"></div>`;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
        const formattedMonth = String(month + 1).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        const dateString = `${year}-${formattedMonth}-${formattedDay}`;

        // Gefilterte Notizen des Tages absteigend sortieren (Neueste Notiz zuerst in der Kachel)
        const matchingNotes = archive
            .filter(item => item.date === dateString)
            .sort((a, b) => b.id - a.id);

        const isToday = (dateString === todayStr);

        let notesHtml = '';
        if (matchingNotes.length > 0) {
            notesHtml = matchingNotes.map(note => `
                <div title="${note.title}" style="background: #007bff; color: white; font-size: 11px; padding: 2px 5px; border-radius: 3px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    📝 ${note.title}
                </div>
            `).join('');
        }

        htmlContent += `
            <div class="calendar-day ${isToday ? 'today' : ''}" onclick="showDayDetails('${dateString}')" style="cursor: pointer; ${isToday ? 'border: 2px solid #007bff; background: #f0f7ff;' : ''}">
                <div class="day-num" style="${isToday ? 'color: #007bff; font-weight: bold;' : ''}">${day}</div>
                ${notesHtml}
            </div>
        `;
    }

    grid.innerHTML = htmlContent;
}

// Zeigt alle Notizen des angeklickten Tages an (Neueste Notizen stehen oben)
async function showDayDetails(dateString) {
    const detailSection = document.getElementById('dayDetailSection');
    const title = document.getElementById('selectedDateTitle');
    const container = document.getElementById('dayDetailContainer');

    if (!detailSection || !container) return;

    const archive = await getArchiveData();

    // Gefilterte Notizen absteigend nach ID sortieren (neueste Notiz zuerst)
    const dayNotes = archive
        .filter(item => item.date === dateString)
        .sort((a, b) => b.id - a.id);

    const parts = dateString.split('-');
    const germanDate = `${parts[2]}.${parts[1]}.${parts[0]}`;

    title.innerText = `Notizen am ${germanDate}`;

    if (dayNotes.length === 0) {
        container.innerHTML = `<p style="color: #666; margin: 0;">An diesem Tag wurden keine Notizen angelegt.</p>`;
    } else {
        container.innerHTML = dayNotes.map(note => `
            <div class="archive-card" style="background: #fff; border-left: 4px solid #007bff; margin-bottom: 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
                <div style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div onclick="toggleContent(${note.id})" style="cursor: pointer; display: flex; align-items: center; gap: 12px; flex-grow: 1;">
                        <span style="font-size: 12px; font-weight: bold; color: #555;">📅 ${note.date}</span>
                        <h4 style="margin: 0; font-size: 15px; color: #222;">${note.title}</h4>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span onclick="toggleContent(${note.id})" style="cursor: pointer; font-size: 11px; background: #e9f2ff; color: #007bff; padding: 2px 6px; border-radius: 4px;">🏷️ ${note.tags || 'Keine Tags'}</span>
                        <button onclick="event.stopPropagation(); editEntry(${note.id});" title="Bearbeiten" style="background: transparent; border: none; cursor: pointer; font-size: 15px;">✏️</button>
                        <button onclick="event.stopPropagation(); deleteEntryFromCalendar(${note.id}, '${dateString}');" title="Löschen" style="background: transparent; border: none; cursor: pointer; font-size: 15px;">🗑️</button>
                        <span onclick="toggleContent(${note.id})" id="icon-${note.id}" style="cursor: pointer; font-size: 12px; color: #888; width: 15px; text-align: center;">▼</span>
                    </div>
                </div>
                <div id="body-${note.id}" style="display: none; padding: 12px; border-top: 1px solid #eee; background: #fff;">
                    <div style="font-size: 14px; color: #333; line-height: 1.5;">${note.content}</div>
                </div>
            </div>
        `).join('');
    }

    detailSection.style.display = "block";
    detailSection.scrollIntoView({ behavior: 'smooth' });
}

function closeDayDetail() {
    const detailSection = document.getElementById('dayDetailSection');
    if (detailSection) detailSection.style.display = "none";
}

async function deleteEntryFromCalendar(id, dateString) {
    if (confirm("Eintrag wirklich löschen?")) {
        let archive = await getArchiveData();
        archive = archive.filter(item => item.id !== id);
        await setArchiveData(archive);
        
        await renderCalendar();
        await showDayDetails(dateString);
        await renderStartDashboard();
    }
}