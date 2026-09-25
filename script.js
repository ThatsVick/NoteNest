// =======================================================================================================================
// GLOBALE VARIABLEN
// =======================================================================================================================

let currentEditId = null;
let currentCalendarDate = new Date();
let dashboardDate = new Date();
let selectedDate = null;
let quill = null;

// =======================================================================================================================
// CUSTOM QUILL EMBEDMENT REGISTRIEREN
// =======================================================================================================================

function registerQuillImageIcon() {
    if (typeof Quill === 'undefined') return;
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
        static value(node) { return node.getAttribute('src'); }
    }
    InlineImageIcon.blotName = 'inlineIcon';
    InlineImageIcon.tagName = 'img';
    Quill.register(InlineImageIcon);
}

// Data Handling (localForage mit localStorage Fallback)
async function getStorageData(key) {
    if (typeof localforage !== 'undefined') return (await localforage.getItem(key)) || [];
    return JSON.parse(localStorage.getItem(key)) || [];
}
async function setStorageData(key, data) {
    if (typeof localforage !== 'undefined') await localforage.setItem(key, data);
    else localStorage.setItem(key, JSON.stringify(data));
}
const getArchiveData = () => getStorageData('myFolderArchive');
const setArchiveData = (data) => setStorageData('myFolderArchive', data);
const getEventsData = () => getStorageData('myCalendarEvents');
const setEventsData = (data) => setStorageData('myCalendarEvents', data);

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

        quill.getModule('toolbar').addHandler('image', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => input.files?.[0] && insertCompressedImageIcon(input.files[0]);
            input.click();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    const targetDate = urlParams.get('date');

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
        modal.innerHTML = `<div onclick="event.stopPropagation();"><img id="imageModalImg" style="max-width:90vw; max-height:90vh; border-radius:8px; box-shadow:0 5px 15px rgba(0,0,0,0.5); display:block;"></div>`;
        modal.onclick = () => modal.style.display = 'none';
        document.body.appendChild(modal);
    }

    await updateArchiveCount();
    renderCssGuide();
    await renderStartDashboard();

    if (document.getElementById('calendarGrid')) {
        if (targetDate) {
            const parts = targetDate.split('-');
            if (parts.length === 3) currentCalendarDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
        }
        await renderCalendar();
        if (targetDate) await showDayDetails(targetDate);
    }
}

document.addEventListener("DOMContentLoaded", initApp);
window.addEventListener("pageshow", renderStartDashboard);

document.addEventListener('click', (e) => {
    if (e.target?.tagName === 'IMG' && (e.target.classList.contains('text-inline-icon') || e.target.style.height === '1.2em')) {
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

function compressImage(file, maxWidth, quality, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function insertCompressedImageIcon(file) {
    compressImage(file, 1500, 0.75, (imgSrc) => {
        if (!quill) return;
        let range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
        quill.insertEmbed(range.index, 'inlineIcon', imgSrc, Quill.sources.USER);
        quill.setSelection(range.index + 1, Quill.sources.SILENT);
    });
}

// =======================================================================================================================
// 2. DASHBOARD-FUNKTIONEN (Start.html)
// =======================================================================================================================

function changeDashboardMonth(delta) {
    dashboardDate.setMonth(dashboardDate.getMonth() + delta);
    renderStartDashboard();
}

async function renderStartDashboard() {
    const listContainer = document.getElementById('recentNotesList');
    const cardTitle = document.getElementById('dashboardTitle') || document.querySelector('.dashboard-card h3');
    if (!listContainer) return;

    const targetYear = dashboardDate.getFullYear();
    const targetMonth = dashboardDate.getMonth();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

    if (cardTitle) {
        cardTitle.innerText = `📅 Aufgaben / Ereignisse (${monthNames[targetMonth]} ${targetYear})`;
    }

    const events = await getEventsData();

    const monthlyEvents = events.filter(evt => {
        if (!evt.date) return false;
        const [year, month] = evt.date.split('-').map(num => parseInt(num, 10));
        const isSelectedMonth = (year === targetYear && (month - 1) === targetMonth);
        
        const isCurrentMonth = (now.getFullYear() === targetYear && now.getMonth() === targetMonth);
        return isSelectedMonth && (!isCurrentMonth || evt.date >= todayStr);
    }).sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.time || '').localeCompare(b.time || ''));

    if (monthlyEvents.length === 0) {
        listContainer.innerHTML = '<li><p style="color: #666; margin: 5px 0;">Keine Aufgaben oder Termine für diesen Monat.</p></li>';
        return;
    }

    listContainer.innerHTML = monthlyEvents.map(evt => {
        const parts = evt.date.split('-');
        const germanDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
        const timeText = (!evt.isAllDay && evt.time) ? (evt.endTime ? `⏰ ${evt.time} - ${evt.endTime} Uhr` : `⏰ ${evt.time} Uhr`) : '📌 Ganztägig';
        const isTask = evt.type === 'task';
        const badgeColor = isTask ? '#6a3518' : '#e57338';
        const typeLabel = isTask ? '📋 Aufgabe' : '📅 Ereignis';
        const urgentBadge = evt.isUrgent ? '<span style="color: #dc3545; font-weight: bold; margin-left: 8px;">⚠️ Wichtig</span>' : '';

        return `
            <li style="border-left: 4px solid ${evt.isUrgent ? '#dc3545' : badgeColor}; padding-left: 8px; display: flex; justify-content: space-between; align-items: center; padding: 8px; transition: background 0.2s;" onmouseover="this.style.background='#fcf4eb';" onmouseout="this.style.background='transparent';">
                <div onclick="editEvent(${evt.id})" style="cursor: pointer; flex-grow: 1;">
                    <span class="list-date">${typeLabel} • ${germanDate} • ${timeText} ${urgentBadge}</span>
                    <p style="margin: 4px 0 0 0;"><strong>${evt.title}</strong></p>
                    ${evt.notes ? `<p style="font-size: 12px; color: #555; margin-top: 2px;">${evt.notes}</p>` : ''}
                </div>
                <button onclick="event.stopPropagation(); deleteEventFromDashboard(${evt.id});" title="Löschen" style="background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 4px 8px; margin-left: 8px;">🗑️</button>
            </li>`;
    }).join('');
}

async function deleteEventFromDashboard(id) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const events = (await getEventsData()).filter(evt => evt.id !== id);
    await setEventsData(events);
    await renderStartDashboard();
    if (document.getElementById('calendarGrid')) await renderCalendar();
}

// =======================================================================================================================
// 3. EDITOR-FUNKTIONEN (Neu.html)
// =======================================================================================================================

async function loadEntryForEditing(id) {
    const archive = await getArchiveData();
    const entry = archive.find(item => item.id === id);
    if (!entry) return;

    if (document.getElementById('datum')) document.getElementById('datum').value = entry.date;
    if (document.getElementById('thema')) document.getElementById('thema').value = entry.title;
    if (document.getElementById('tags')) document.getElementById('tags').value = entry.tags;
    if (quill) quill.root.innerHTML = entry.content;

    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) saveBtn.innerText = "Änderung speichern";
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
            if (index !== -1) archive[index] = { id: currentEditId, date: datum, title: thema, tags, content: inhalt };
        } else {
            currentEditId = Date.now();
            archive.push({ id: currentEditId, date: datum, title: thema, tags, content: inhalt });
        }

        await setArchiveData(archive);
        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) saveBtn.innerText = "Änderung speichern";
        alert("Erfolgreich gespeichert!");
    } catch (e) {
        console.error("Speicherfehler:", e);
        alert("Fehler beim Speichern: " + e.message);
    }
}

// =======================================================================================================================
// 4. ARCHIV-FUNKTIONEN (Ordner.html)
// =======================================================================================================================

async function updateArchiveCount() {
    const archive = await getArchiveData();
    const countInfo = document.getElementById('archiveCountInfo');
    if (countInfo) countInfo.innerText = `${archive.length} ${archive.length === 1 ? "Eintrag" : "Einträge"}`;
}

async function openArchiveView() {
    document.getElementById('cssGuideSection')?.style.setProperty('display', 'none');
    const archiveSec = document.getElementById('archiveSection');
    if (archiveSec) {
        archiveSec.style.display = "block";
        await loadArchive();
        archiveSec.scrollIntoView({ behavior: 'smooth' });
    }
}

function openCssGuideView() {
    document.getElementById('archiveSection')?.style.setProperty('display', 'none');
    const cssSec = document.getElementById('cssGuideSection');
    if (cssSec) {
        cssSec.style.display = "block";
        renderCssGuide();
        cssSec.scrollIntoView({ behavior: 'smooth' });
    }
}

function getMonthYearLabel(dateString) {
    if (!dateString || !dateString.includes('-')) return "Unbekannter Monat";
    const parts = dateString.split('-');
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    return `${monthNames[parseInt(parts[1], 10) - 1] || 'Unbekannt'} ${parts[0]}`;
}

// Hilfsfunktion zur UI-Erstellung von Notizkarten (Warmes Snorri-Kupferrot statt Blau)
function createNoteCardHTML(item, deleteFnName) {
    return `
        <div class="archive-card" data-tags="${item.tags || ''}" data-title="${item.title}" data-date="${item.date || ''}" style="background: #fff; border-left: 4px solid #c85a28; margin-bottom: 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
                <div onclick="toggleContent(${item.id})" style="cursor: pointer; display: flex; align-items: center; gap: 12px; flex-grow: 1;">
                    <span style="font-size: 12px; font-weight: bold; color: #555;">📅 ${item.date}</span>
                    <h4 style="margin: 0; font-size: 15px; color: #222;">${item.title}</h4>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span onclick="toggleContent(${item.id})" style="cursor: pointer; font-size: 11px; background: #fbf3eb; color: #c85a28; padding: 2px 6px; border-radius: 4px;">🏷️ ${item.tags || 'Keine Tags'}</span>
                    <button onclick="event.stopPropagation(); editEntry(${item.id});" title="Bearbeiten" style="background: transparent; border: none; cursor: pointer; font-size: 15px;">✏️</button>
                    <button onclick="event.stopPropagation(); ${deleteFnName}(${item.id}, '${item.date}');" title="Löschen" style="background: transparent; border: none; cursor: pointer; font-size: 15px;">🗑️</button>
                    <span onclick="toggleContent(${item.id})" id="icon-${item.id}" style="cursor: pointer; font-size: 12px; color: #888; width: 15px; text-align: center;">▼</span>
                </div>
            </div>
            <div id="body-${item.id}" style="display: none; padding: 12px; border-top: 1px solid #eee; background: #fff;">
                <div style="font-size: 14px; color: #333; line-height: 1.5;">${item.content}</div>
            </div>
        </div>`;
}

async function loadArchive() {
    const container = document.getElementById('archiveContainer');
    if (!container) return;

    const archive = await getArchiveData();
    if (archive.length === 0) {
        container.innerHTML = "<p style='color: #666;'>Noch keine Einträge im Archiv vorhanden.</p>";
        return;
    }

    const sortValue = document.getElementById('sortSelect')?.value || 'date-desc';
    archive.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase(), titleB = (b.title || '').toLowerCase();
        if (sortValue === 'date-asc') return new Date(a.date) - new Date(b.date);
        if (sortValue === 'title-asc') return titleA.localeCompare(titleB);
        if (sortValue === 'title-desc') return titleB.localeCompare(titleA);
        return new Date(b.date) - new Date(a.date);
    });

    const monthGroups = {};
    archive.forEach(item => {
        const label = getMonthYearLabel(item.date);
        (monthGroups[label] = monthGroups[label] || []).push(item);
    });

    let folderIdx = 0;
    container.innerHTML = Object.keys(monthGroups).map(monthLabel => {
        const items = monthGroups[monthLabel];
        folderIdx++;
        return `
            <div class="month-folder-card" style="background: #fff; border: 1px solid #c85a28; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div onclick="toggleMonthFolder(${folderIdx})" style="padding: 12px 15px; background: #fbf3eb; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 16px; color: #c85a28;">📁 ${monthLabel}</h3>
                    <span id="month-folder-icon-${folderIdx}" style="font-size: 13px; color: #c85a28; font-weight: bold;">▼ (${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'})</span>
                </div>
                <div id="month-folder-body-${folderIdx}" class="month-folder-body" style="display: none; padding: 15px; background: #fafafa; border-top: 1px solid #f2dfce;">
                    ${items.map(item => createNoteCardHTML(item, 'deleteEntry')).join('')}
                </div>
            </div>`;
    }).join('');

    if (typeof filterArchive === "function") filterArchive();
}

function toggleMonthFolder(idx) {
    const body = document.getElementById(`month-folder-body-${idx}`);
    const icon = document.getElementById(`month-folder-icon-${idx}`);
    if (!body) return;
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "block" : "none";
    if (icon) icon.innerText = icon.innerText.replace(isHidden ? "▼" : "▲", isHidden ? "▲" : "▼");
}

function toggleContent(id) {
    const body = document.getElementById(`body-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    if (!body) return;
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "block" : "none";
    if (icon) icon.innerText = isHidden ? "▲" : "▼";
}

function filterArchive() {
    const searchInput = document.getElementById('tagSearchInput');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.month-folder-card').forEach((folderCard, idx) => {
        const body = folderCard.querySelector('.month-folder-body');
        const icon = document.getElementById(`month-folder-icon-${idx + 1}`);
        let hasMatch = false;

        folderCard.querySelectorAll('.archive-card').forEach(card => {
            const tags = (card.getAttribute('data-tags') || '').toLowerCase();
            const title = (card.getAttribute('data-title') || '').toLowerCase();
            const date = (card.getAttribute('data-date') || '').toLowerCase();
            const parts = date.split('-');
            const germanDate = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : "";

            const matches = !query || tags.includes(query) || title.includes(query) || date.includes(query) || germanDate.includes(query);
            card.style.display = matches ? "block" : "none";
            if (matches && query) hasMatch = true;
        });

        if (query) {
            folderCard.style.display = hasMatch ? "block" : "none";
            if (body) body.style.display = hasMatch ? "block" : "none";
            if (icon) icon.innerText = icon.innerText.replace(hasMatch ? "▼" : "▲", hasMatch ? "▲" : "▼");
        } else {
            folderCard.style.display = "block";
            if (body) body.style.display = "none";
            if (icon) icon.innerText = icon.innerText.replace("▲", "▼");
        }
    });
}

async function deleteEntry(id) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const archive = (await getArchiveData()).filter(item => item.id !== id);
    await setArchiveData(archive);
    await loadArchive();
    await updateArchiveCount();
}

function editEntry(id) {
    window.location.href = `Neu.html?edit=${id}`;
}

// =======================================================================================================================
// 5. CSS-HANDBUCH UND LERNDATENBANK
// =======================================================================================================================

const cssDatabase = [
    {
        category: "Border & Rahmen", icon: "🔲",
        commands: [
            { name: "border", syntax: "border: 1px solid #000;", desc: "Kurzform für Breite, Stil und Farbe des Außenrahmens." },
            { name: "border-width", syntax: "border-width: 2px;", desc: "Bestimmt die Dicke des Außenrahmens." },
            { name: "border-style", syntax: "border-style: solid | dashed | dotted...", desc: "Legt den Rahmentyp fest." },
            { name: "border-color", syntax: "border-color: #c85a28;", desc: "Bestimmt die Farbe des Rahmens." },
            { name: "border-radius", syntax: "border-radius: 8px | 50%;", desc: "Ründet die Ecken ab." },
            { name: "border-top/bottom/left/right", syntax: "border-bottom: 2px solid #000;", desc: "Setzt den Rahmen gezielt an eine Seite." },
            { name: "border-image", syntax: "border-image: url(...) 30 round;", desc: "Verwendet ein Bild als Rahmen." },
            { name: "outline", syntax: "outline: 2px dashed red;", desc: "Linie außerhalb des Rahmens ohne Platz im Layout." },
            { name: "outline-offset", syntax: "outline-offset: 4px;", desc: "Abstand zwischen Outline und Rahmen." }
        ]
    },
    {
        category: "Abstände & Box-Modell", icon: "📦",
        commands: [
            { name: "margin", syntax: "margin: 10px 20px;", desc: "Außenabstand zu anderen Elementen." },
            { name: "margin-top/right/bottom/left", syntax: "margin-top: 15px;", desc: "Gezielter Außenabstand." },
            { name: "padding", syntax: "padding: 15px;", desc: "Innenabstand zwischen Rahmen und Inhalt." },
            { name: "padding-top/right/bottom/left", syntax: "padding-left: 20px;", desc: "Gezielter Innenabstand." },
            { name: "width / height", syntax: "width: 100px; height: 50px;", desc: "Bestimmt feste Breite und Höhe." },
            { name: "min/max-width", syntax: "max-width: 1200px;", desc: "Setzt minimale/maximale Breite." },
            { name: "min/max-height", syntax: "min-height: 100vh;", desc: "Setzt minimale/maximale Höhe." },
            { name: "box-sizing", syntax: "box-sizing: border-box;", desc: "Rechnet Padding/Border in Gesamtbreite ein." }
        ]
    },
    {
        category: "Flexbox Layout", icon: "📐",
        commands: [
            { name: "display: flex", syntax: "display: flex | inline-flex;", desc: "Aktiviert Flexbox-System." },
            { name: "flex-direction", syntax: "flex-direction: row | column;", desc: "Bestimmt die Hauptachse." },
            { name: "justify-content", syntax: "justify-content: center | space-between;", desc: "Richtet Elemente auf Hauptachse aus." },
            { name: "align-items", syntax: "align-items: center | flex-start;", desc: "Richtet Elemente auf Querachse aus." },
            { name: "flex-wrap", syntax: "flex-wrap: wrap | nowrap;", desc: "Automatische Zeilenumbrüche." },
            { name: "gap", syntax: "gap: 15px;", desc: "Abstand zwischen Flex/Grid-Elementen." },
            { name: "flex-grow", syntax: "flex-grow: 1;", desc: "Wachstumsfaktor des Elements." },
            { name: "flex-shrink / basis", syntax: "flex-basis: 200px;", desc: "Schrumpf- und Ausgangsgröße." }
        ]
    },
    {
        category: "CSS Grid Layout", icon: "🏁",
        commands: [
            { name: "display: grid", syntax: "display: grid;", desc: "Aktiviert Raster-Layout." },
            { name: "grid-template-columns", syntax: "repeat(3, 1fr);", desc: "Spaltenanzahl und -breite." },
            { name: "grid-template-rows", syntax: "auto 1fr 100px;", desc: "Zeilenhöhen definieren." },
            { name: "grid-column / row", syntax: "grid-column: 1 / 3;", desc: "Erstreckung über Spalten/Zeilen." },
            { name: "justify / align-items", syntax: "justify-items: center;", desc: "Ausrichtung der Zelleninhalte." }
        ]
    },
    {
        category: "Text & Typografie", icon: "✍️",
        commands: [
            { name: "color", syntax: "color: #333333;", desc: "Bestimmt die Textfarbe." },
            { name: "font-family", syntax: "font-family: Arial, sans-serif;", desc: "Schriftart festlegen." },
            { name: "font-size", syntax: "font-size: 16px | 1.2rem;", desc: "Schriftgröße einstellen." },
            { name: "font-weight", syntax: "font-weight: bold | 600;", desc: "Schriftstärke anpassen." },
            { name: "text-align", syntax: "text-align: center | left;", desc: "Textausrichtung steuern." },
            { name: "text-decoration", syntax: "text-decoration: underline;", desc: "Textunterstreichung/Effekte." },
            { name: "line-height", syntax: "line-height: 1.5;", desc: "Zeilenabstand im Text." },
            { name: "white-space", syntax: "white-space: pre-wrap;", desc: "Textumbruch-Verhalten steuern." }
        ]
    },
    {
        category: "Hintergrund & Farben", icon: "🎨",
        commands: [
            { name: "background-color", syntax: "background-color: #ffffff;", desc: "Hintergrundfarbe festlegen." },
            { name: "background-image", syntax: "background-image: url('...');", desc: "Hintergrundbild oder Verlauf." },
            { name: "background-size", syntax: "background-size: cover | contain;", desc: "Skalierung des Hintergrundbilds." },
            { name: "opacity", syntax: "opacity: 0.5 | 1;", desc: "Transparenz des Elements." }
        ]
    },
    {
        category: "Positionierung & Anzeige", icon: "📍",
        commands: [
            { name: "display", syntax: "display: block | flex | none;", desc: "Anzeigeverhalten bestimmen." },
            { name: "position", syntax: "position: relative | absolute | fixed;", desc: "Positionierungsart wählen." },
            { name: "top/right/bottom/left", syntax: "top: 10px;", desc: "Exakte Verschiebung in Pixel/Prozent." },
            { name: "z-index", syntax: "z-index: 10 | 9999;", desc: "Ebenen-Stapelreihenfolge." },
            { name: "overflow", syntax: "overflow: hidden | auto;", desc: "Verhalten bei Überlauf." }
        ]
    },
    {
        category: "Transformationen & Effekte", icon: "✨",
        commands: [
            { name: "transform", syntax: "transform: scale(1.2) rotate(45deg);", desc: "Drehen, Skalieren oder Verschieben." },
            { name: "transition", syntax: "transition: all 0.3s ease;", desc: "Sanfte Eigenschafts-Übergänge." },
            { name: "box-shadow", syntax: "box-shadow: 0 4px 8px rgba(0,0,0,0.2);", desc: "Schattenwurf um das Element." },
            { name: "cursor", syntax: "cursor: pointer;", desc: "Mauszeiger-Form anpassen." }
        ]
    }
];

function renderCssGuide() {
    const container = document.getElementById('cssGuideContainer');
    if (!container) return;

    container.innerHTML = cssDatabase.map((cat, catIdx) => `
        <div class="css-category-card" style="background: #fff; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div onclick="toggleCssCategory(${catIdx})" style="padding: 12px 15px; background: #fbf3eb; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee;">
                <h3 style="margin: 0; font-size: 16px; color: #c85a28;">${cat.icon} ${cat.category}</h3>
                <span id="css-cat-icon-${catIdx}" style="font-size: 12px; color: #666;">▼ (${cat.commands.length} Befehle)</span>
            </div>
            <div id="css-cat-body-${catIdx}" class="css-cat-body" style="display: none; padding: 15px;">
                ${cat.commands.map(cmd => `
                    <div class="css-command-item" data-name="${cmd.name.toLowerCase()}" data-desc="${cmd.desc.toLowerCase()}" style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed #eee;">
                        <strong style="color: #222; font-size: 15px;">${cmd.name}</strong>
                        <pre style="background: #f4f4f4; padding: 6px 10px; border-radius: 4px; font-size: 13px; color: #c85a28; margin: 5px 0;">${cmd.syntax}</pre>
                        <span style="font-size: 13px; color: #555;">${cmd.desc}</span>
                    </div>`).join('')}
            </div>
        </div>`).join('');
}

function toggleCssCategory(idx) {
    const body = document.getElementById(`css-cat-body-${idx}`);
    const icon = document.getElementById(`css-cat-icon-${idx}`);
    if (!body) return;
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "block" : "none";
    if (icon) icon.innerText = isHidden ? "▲ Einklappen" : `▼ (${cssDatabase[idx].commands.length} Befehle)`;
}

function searchCssGuide() {
    const query = document.getElementById('cssSearchInput')?.value.toLowerCase().trim();
    if (query === undefined) return;

    document.querySelectorAll('.css-category-card').forEach((card, idx) => {
        let hasMatch = false;
        const body = document.getElementById(`css-cat-body-${idx}`);

        card.querySelectorAll('.css-command-item').forEach(item => {
            const matches = !query || item.getAttribute('data-name').includes(query) || item.getAttribute('data-desc').includes(query);
            item.style.display = matches ? "block" : "none";
            if (matches && query) hasMatch = true;
        });

        if (query) {
            card.style.display = hasMatch ? "block" : "none";
            if (body) body.style.display = hasMatch ? "block" : "none";
        } else {
            card.style.display = "block";
            if (body) body.style.display = "none";
        }
    });
}

// =======================================================================================================================
// 6. DYNAMISCHER KALENDER MIT TERMINEN UND TAGES-DETAILANSICHT (Kalender.html)
// =======================================================================================================================

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    selectedDate = null;
    renderCalendar();
    closeDayDetail();
}

async function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthYearTitle = document.getElementById('currentMonthYear');
    if (!grid || !monthYearTitle) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

    monthYearTitle.innerText = `${monthNames[month]} ${year}`;

    let htmlContent = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(day => `<div class="day-label">${day}</div>`).join('');

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const [archive, events] = await Promise.all([getArchiveData(), getEventsData()]);

    for (let i = 0; i < startOffset; i++) htmlContent += `<div class="calendar-day empty"></div>`;

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
        const formattedMonth = String(month + 1).padStart(2, '0');
        const formattedDay = String(day).padStart(2, '0');
        const dateString = `${year}-${formattedMonth}-${formattedDay}`;

        const matchingNotes = archive.filter(item => item.date === dateString).sort((a, b) => b.id - a.id);
        const matchingEvents = events.filter(evt => evt.date === dateString).sort((a, b) => {
            if (a.isAllDay && !b.isAllDay) return -1;
            if (!a.isAllDay && b.isAllDay) return 1;
            return (a.time || '').localeCompare(b.time || '');
        });

        const isToday = dateString === todayStr;
        const isSelected = dateString === selectedDate;

        // Aufgaben: #6a3518 (Dunkles Kastanienbraun) | Ereignisse: #e57338 (Hellers Orange-Rot)
        let itemsHtml = matchingEvents.map(evt => `
            <div class="${evt.isUrgent ? 'event-urgent' : ''}" style="background: ${evt.type === 'task' ? '#6a3518' : '#e57338'}; color: white; font-size: 10px; padding: 2px 4px; border-radius: 3px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${evt.type === 'task' ? '📋 ' : '📅 '}${evt.title}
            </div>`).join('') + matchingNotes.map(note => `
            <div style="background: #6c757d; color: white; font-size: 10px; padding: 2px 4px; border-radius: 3px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                📝 ${note.title}
            </div>`).join('');

        htmlContent += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="showDayDetails('${dateString}')" style="cursor: pointer;">
                <div class="day-num" style="${isToday ? 'color: #c85a28; font-weight: bold;' : ''}">${day}</div>
                ${itemsHtml}
            </div>`;
    }

    grid.innerHTML = htmlContent;
}

async function showDayDetails(dateString) {
    selectedDate = dateString;
    await renderCalendar();

    const detailSection = document.getElementById('dayDetailSection');
    const title = document.getElementById('selectedDateTitle');
    const container = document.getElementById('dayDetailContainer');
    if (!detailSection || !container) return;

    const [archive, events] = await Promise.all([getArchiveData(), getEventsData()]);
    const dayNotes = archive.filter(item => item.date === dateString).sort((a, b) => b.id - a.id);
    const dayEvents = events.filter(evt => evt.date === dateString).sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (a.time || '').localeCompare(b.time || '');
    });

    const parts = dateString.split('-');
    title.innerText = `Einträge am ${parts[2]}.${parts[1]}.${parts[0]}`;

    if (dayNotes.length === 0 && dayEvents.length === 0) {
        container.innerHTML = `<p style="color: #666; margin: 0;">An diesem Tag gibt es keine Aufgaben, Ereignisse oder Notizen.</p>`;
    } else {
        let html = '';
        if (dayEvents.length > 0) {
            html += `<h4 style="margin: 10px 0 8px 0; color: #000;">📅 Aufgaben & Ereignisse</h4>` + dayEvents.map(evt => {
                const timeStr = !evt.isAllDay ? (evt.endTime ? `⏰ ${evt.time} - ${evt.endTime} Uhr` : `⏰ ${evt.time} Uhr`) : '📌 Ganztägig';
                const isTask = evt.type === 'task';
                const borderColor = isTask ? '#6a3518' : '#e57338';
                return `
                    <div class="event-card-item ${evt.isUrgent ? 'event-urgent' : ''}" style="border-left: 4px solid ${borderColor};">
                        <div>
                            <strong>${isTask ? '📋 [Aufgabe]' : '📅 [Ereignis]'} ${timeStr} - ${evt.title}</strong>
                            ${evt.notes ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #555;">${evt.notes}</p>` : ''}
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="editEvent(${evt.id})" title="Bearbeiten" style="background: transparent; border: none; cursor: pointer; font-size: 16px;">✏️</button>
                            <button onclick="deleteEvent(${evt.id}, '${dateString}')" title="Löschen" style="background: transparent; border: none; cursor: pointer; font-size: 16px;">🗑️</button>
                        </div>
                    </div>`;
            }).join('');
        }

        if (dayNotes.length > 0) {
            html += `<h4 style="margin: 15px 0 8px 0; color: #000;">📝 Notizen</h4>` + dayNotes.map(note => createNoteCardHTML(note, 'deleteEntryFromCalendar')).join('');
        }
        container.innerHTML = html;
    }

    detailSection.style.display = "block";
    detailSection.scrollIntoView({ behavior: 'smooth' });
}

function closeDayDetail() {
    selectedDate = null;
    renderCalendar();
    document.getElementById('dayDetailSection')?.style.setProperty('display', 'none');
}

async function deleteEntryFromCalendar(id, dateString) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const archive = (await getArchiveData()).filter(item => item.id !== id);
    await setArchiveData(archive);
    await renderCalendar();
    await showDayDetails(dateString);
    await renderStartDashboard();
}

// =======================================================================================================================
// 7. TERMIN/AUFGABEN-MODAL & SPEICHERUNG / BEARBEITUNG
// =======================================================================================================================

function openEventModal(dateStr = '') {
    const form = document.getElementById('eventForm');
    if (form) form.reset();

    document.getElementById('eventId').value = '';
    document.getElementById('modalTitle').innerText = 'Eintrag erstellen';
    document.getElementById('saveEventBtn').innerText = 'Speichern';

    const taskRadio = document.getElementById('typeTask');
    if (taskRadio) taskRadio.checked = true;

    const calBtn = document.getElementById('goToCalendarBtn');
    if (calBtn) calBtn.style.display = 'none';

    toggleAllDay(false);
    const urgentCb = document.getElementById('eventUrgent');
    if (urgentCb) urgentCb.checked = false;

    document.getElementById('eventDate').value = dateStr || new Date().toISOString().split('T')[0];

    const modal = document.getElementById('eventModal');
    if (modal) modal.style.display = 'flex';
}

function closeEventModal() {
    document.getElementById('eventModal')?.style.setProperty('display', 'none');
    document.getElementById('eventForm')?.reset();
    const endTimeInput = document.getElementById('eventEndTime');
    if (endTimeInput) endTimeInput.value = '';
}

function closeEventModalOnOverlay(e) {
    if (e.target?.id === 'eventModal') closeEventModal();
}

function toggleAllDay(isAllDay) {
    const timeInput = document.getElementById('eventTime');
    const endTimeInput = document.getElementById('eventEndTime');
    const checkbox = document.getElementById('eventAllDay');
    
    if (checkbox) checkbox.checked = isAllDay;

    if (timeInput) {
        timeInput.value = isAllDay ? '' : timeInput.value;
        timeInput.required = !isAllDay;
        timeInput.disabled = isAllDay;
        timeInput.style.backgroundColor = isAllDay ? '#e9ecef' : '#ffffff';
    }
    if (endTimeInput) {
        if (isAllDay) endTimeInput.value = '';
        endTimeInput.disabled = isAllDay;
        endTimeInput.style.backgroundColor = isAllDay ? '#e9ecef' : '#ffffff';
    }
}

async function editEvent(id) {
    const events = await getEventsData();
    const evt = events.find(e => e.id === id);
    if (!evt) return;

    document.getElementById('eventId').value = evt.id;
    document.getElementById('eventTitle').value = evt.title;
    document.getElementById('eventDate').value = evt.date;
    document.getElementById('eventNotes').value = evt.notes || '';

    const typeRadio = document.getElementById(evt.type === 'event' ? 'typeEvent' : 'typeTask');
    if (typeRadio) typeRadio.checked = true;

    const calBtn = document.getElementById('goToCalendarBtn');
    if (calBtn) calBtn.style.display = 'inline-block';

    const urgentCb = document.getElementById('eventUrgent');
    if (urgentCb) urgentCb.checked = !!evt.isUrgent;

    if (evt.isAllDay) {
        toggleAllDay(true);
    } else {
        toggleAllDay(false);
        document.getElementById('eventTime').value = evt.time || '';
        const endTimeInput = document.getElementById('eventEndTime');
        if (endTimeInput) endTimeInput.value = evt.endTime || '';
    }

    document.getElementById('modalTitle').innerText = 'Eintrag bearbeiten';
    document.getElementById('saveEventBtn').innerText = 'Änderungen speichern';
    document.getElementById('eventModal')?.style.setProperty('display', 'flex');
}

function goToCalendarDate() {
    const dateVal = document.getElementById('eventDate')?.value;
    if (dateVal) window.location.href = `Kalender.html?date=${dateVal}`;
}

async function saveEvent(event) {
    event.preventDefault();

    const idInput = document.getElementById('eventId').value;
    const isEdit = idInput !== '';
    const isAllDay = document.getElementById('eventAllDay').checked;
    const isUrgent = document.getElementById('eventUrgent')?.checked || false;
    const eventRadio = document.getElementById('typeEvent');
    const selectedType = (eventRadio && eventRadio.checked) ? 'event' : 'task';

    const eventData = {
        id: isEdit ? parseInt(idInput, 10) : Date.now(),
        type: selectedType,
        title: document.getElementById('eventTitle').value.trim(),
        date: document.getElementById('eventDate').value,
        time: isAllDay ? '' : document.getElementById('eventTime').value,
        endTime: isAllDay ? '' : (document.getElementById('eventEndTime')?.value || ''),
        isAllDay,
        isUrgent,
        notes: document.getElementById('eventNotes').value.trim()
    };

    try {
        let events = await getEventsData();
        if (isEdit) {
            const index = events.findIndex(e => e.id === eventData.id);
            if (index !== -1) events[index] = eventData;
        } else {
            events.push(eventData);
        }

        await setEventsData(events);
        closeEventModal();
        
        if (document.getElementById('calendarGrid')) {
            await renderCalendar();
            await showDayDetails(eventData.date);
        }
        await renderStartDashboard();
        alert(isEdit ? "Erfolgreich aktualisiert!" : "Erfolgreich gespeichert!");
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
        alert("Fehler beim Speichern: " + e.message);
    }
}

async function deleteEvent(id, dateString) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const events = (await getEventsData()).filter(evt => evt.id !== id);
    await setEventsData(events);

    if (document.getElementById('calendarGrid')) {
        await renderCalendar();
        await showDayDetails(dateString);
    }
    await renderStartDashboard();
}