let currentEditId = null; // Speichert die ID, wenn ein Eintrag bearbeitet wird

// ==========================================
// 1. Initialisierung beim Laden der Seite
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    const datumInput = document.getElementById('datum');
    
    // Prüfen, ob eine ID zum Bearbeiten in der URL übergeben wurde (?edit=ID)
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    if (editId) {
        currentEditId = parseInt(editId);
        loadEntryForEditing(currentEditId);
    } else if (datumInput && !datumInput.value) {
        datumInput.value = new Date().toISOString().split('T')[0];
    }

    // Drag and Drop Unterstützung für das Schreibfeld auf Neu.html
    const editor = document.getElementById('editorText');
    if (editor) {
        editor.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            editor.style.borderColor = '#007bff';
        });

        editor.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            editor.style.borderColor = '#ccc';
        });

        editor.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            editor.style.borderColor = '#ccc';

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    if (files[i].type.startsWith('image/')) {
                        insertImageFile(files[i]);
                    }
                }
            }
        });
    }

    // Falls wir auf Ordner.html sind, Anzahl der Notizen laden
    updateArchiveCount();
});

// ==========================================
// 2. Editor-Funktionen (Neu.html)
// ==========================================

// Steuert Fett, Kursiv und Unterstrichen
function execCmd(command) {
    document.execCommand(command, false, null);
}

// Dynamische Schriftgröße ändern
function changeFontSize(size) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const span = document.createElement('span');
        span.style.fontSize = size;
        const range = selection.getRangeAt(0);
        range.surroundContents(span);
    } else {
        const editor = document.getElementById('editorText');
        if (editor) editor.style.fontSize = size;
    }
}

// Textfarbe ändern
function changeTextColor(color) {
    document.execCommand('foreColor', false, color);
}

// Hilfsfunktion zum Verarbeiten, Einfügen, Skalieren & Löschen von Bildern
function insertImageFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.resize = 'both';
        wrapper.style.overflow = 'hidden';
        wrapper.style.maxWidth = '100%';
        wrapper.style.width = '300px';
        wrapper.style.margin = '10px 0';
        wrapper.style.border = '1px dashed #bbb';
        wrapper.style.borderRadius = '6px';
        wrapper.contentEditable = 'false';

        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.display = 'block';

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '✖';
        deleteBtn.title = 'Bild löschen';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '5px';
        deleteBtn.style.right = '5px';
        deleteBtn.style.background = 'rgba(220, 53, 69, 0.85)';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.width = '24px';
        deleteBtn.style.height = '24px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.style.display = 'flex';
        deleteBtn.style.alignItems = 'center';
        deleteBtn.style.justifyContent = 'center';

        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            wrapper.remove();
        });

        wrapper.appendChild(img);
        wrapper.appendChild(deleteBtn);

        const editor = document.getElementById('editorText');
        if (editor) editor.appendChild(wrapper);
    };
    reader.readAsDataURL(file);
}

// Bild über den Datei-Button auswählen
function insertImage(input) {
    if (input.files && input.files[0]) {
        insertImageFile(input.files[0]);
    }
}

// Lädt den bestehenden Eintrag in die Felder auf Neu.html (bei Bearbeiten)
function loadEntryForEditing(id) {
    const archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];
    const entry = archive.find(item => item.id === id);

    if (entry) {
        if (document.getElementById('datum')) document.getElementById('datum').value = entry.date;
        if (document.getElementById('thema')) document.getElementById('thema').value = entry.title;
        if (document.getElementById('tags')) document.getElementById('tags').value = entry.tags;
        if (document.getElementById('editorText')) document.getElementById('editorText').innerHTML = entry.content;

        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) saveBtn.innerText = "Änderung speichern";
    }
}

// Speichert neue Notizen oder überschreibt bearbeitete Notizen
function saveToArchive() {
    const datum = document.getElementById('datum').value;
    const thema = document.getElementById('thema').value.trim() || 'Unbenanntes Thema';
    const tags = document.getElementById('tags').value.trim();
    const editor = document.getElementById('editorText');
    const inhalt = editor ? editor.innerHTML : '';

    if (!inhalt || inhalt.trim() === '') {
        alert("Bitte schreibe zuerst einen Text!");
        return;
    }

    let archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];

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
        const newEntry = {
            id: Date.now(),
            date: datum,
            title: thema,
            tags: tags,
            content: inhalt
        };
        archive.push(newEntry);
    }

    try {
        localStorage.setItem('myFolderArchive', JSON.stringify(archive));
        alert(currentEditId ? "Änderung erfolgreich gespeichert!" : "Eintrag erfolgreich im Datumsarchiv gespeichert!");
        window.location.href = "Ordner.html";
    } catch (e) {
        alert("Der Inhalt ist zu groß für den Speicher. Bitte reduziere die Bildgrößen.");
    }
}

// ==========================================
// 3. Archiv-Funktionen (Ordner.html)
// ==========================================

function updateArchiveCount() {
    const archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];
    const countInfo = document.getElementById('archiveCountInfo');
    if (countInfo) {
        countInfo.innerText = archive.length + (archive.length === 1 ? " Eintrag" : " Einträge");
    }
}

function openArchiveView() {
    const section = document.getElementById('archiveSection');
    if (section) {
        section.style.display = "block";
        loadArchive();
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function loadArchive() {
    const container = document.getElementById('archiveContainer');
    if (!container) return;

    const archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];

    if (archive.length === 0) {
        container.innerHTML = "<p style='color: #666;'>Noch keine Einträge im Archiv vorhanden.</p>";
        return;
    }

    // Aktuelle Sortierung abfragen
    const sortSelect = document.getElementById('sortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'date-desc';

    // Array entsprechend sortieren
    archive.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        const tagsA = (a.tags || '').toLowerCase();
        const tagsB = (b.tags || '').toLowerCase();

        switch (sortValue) {
            case 'date-asc':
                return new Date(a.date) - new Date(b.date);
            case 'date-desc':
                return new Date(b.date) - new Date(a.date);
            case 'title-asc':
                return titleA.localeCompare(titleB);
            case 'title-desc':
                return titleB.localeCompare(titleA);
            case 'tags-asc':
                return tagsA.localeCompare(tagsB);
            case 'tags-desc':
                return tagsB.localeCompare(tagsA);
            default:
                return new Date(b.date) - new Date(a.date);
        }
    });

    container.innerHTML = archive.map(item => `
        <div class="archive-card" data-tags="${item.tags || ''}" data-title="${item.title}" style="background: #fff; border-left: 4px solid #007bff; margin-bottom: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">
            
            <div style="padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; background: #fafafa;">
                
                <div onclick="toggleContent(${item.id})" style="cursor: pointer; display: flex; align-items: center; gap: 15px; flex-grow: 1;">
                    <span style="font-size: 13px; font-weight: bold; color: #555;">📅 ${item.date}</span>
                    <h3 style="margin: 0; font-size: 16px; color: #222;">${item.title}</h3>
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <span onclick="toggleContent(${item.id})" style="cursor: pointer; font-size: 12px; background: #e9f2ff; color: #007bff; padding: 3px 8px; border-radius: 4px;">🏷️ ${item.tags || 'Keine Tags'}</span>
                    
                    <button onclick="event.stopPropagation(); editEntry(${item.id});" title="Eintrag bearbeiten" style="background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px;">
                        ✏️
                    </button>

                    <button onclick="event.stopPropagation(); deleteEntry(${item.id});" title="Eintrag löschen" style="background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px;">
                        🗑️
                    </button>

                    <span onclick="toggleContent(${item.id})" id="icon-${item.id}" style="cursor: pointer; font-size: 12px; color: #888; width: 15px; text-align: center;">▼</span>
                </div>

            </div>

            <div id="body-${item.id}" style="display: none; padding: 15px; border-top: 1px solid #eee; background: #fff;">
                <div style="font-size: 14px; color: #333; line-height: 1.5;">${item.content}</div>
            </div>

        </div>
    `).join('');

    // Falls ein Suchbegriff vorhanden ist, Filter direkt anwenden
    if (typeof filterArchive === "function") {
        filterArchive();
    }
}

function toggleContent(id) {
    const body = document.getElementById(`body-${id}`);
    const icon = document.getElementById(`icon-${id}`);

    if (body.style.display === "none") {
        body.style.display = "block";
        icon.innerText = "▲";
    } else {
        body.style.display = "none";
        icon.innerText = "▼";
    }
}

function filterArchive() {
    const searchInput = document.getElementById('tagSearchInput');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase();
    const cards = document.querySelectorAll('.archive-card');

    cards.forEach(card => {
        const tags = card.getAttribute('data-tags').toLowerCase();
        const title = card.getAttribute('data-title').toLowerCase();

        if (tags.includes(query) || title.includes(query)) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
}

function deleteEntry(id) {
    if (confirm("Eintrag wirklich löschen?")) {
        let archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];
        archive = archive.filter(item => item.id !== id);
        localStorage.setItem('myFolderArchive', JSON.stringify(archive));
        loadArchive();
        updateArchiveCount();
    }
}

function editEntry(id) {
    window.location.href = `Neu.html?edit=${id}`;
}