let currentEditId = null; // Speichert die ID der Notiz, wenn ein bestehender Eintrag bearbeitet wird

// =======================================================================================================================
// 1. INITIALISIERUNG BEIM LADEN DER SEITE
// =======================================================================================================================
document.addEventListener("DOMContentLoaded", function() {
    const datumInput = document.getElementById('datum'); // Holt das Datums-Eingabefeld aus der Neu.html
    
    // Liest die Parameter aus der URL aus, um zu prüfen, ob eine Notiz bearbeitet werden soll (?edit=ID)
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');

    if (editId) {
        currentEditId = parseInt(editId); // Wandelt die gefundene ID in eine Zahl um
        loadEntryForEditing(currentEditId); // Lädt die bestehende Notiz in die Formularfelder
    } else if (datumInput && !datumInput.value) {
        datumInput.value = new Date().toISOString().split('T')[0]; // Setzt automatisch das heutige Datum
    }

    // Drag-and-Drop-Unterstützung für das Schreibfeld auf Neu.html einrichten
    const editor = document.getElementById('editorText');
    if (editor) {
        // Signalisiert visuell (blauer Rahmen), dass ein Bild über den Editor gezogen wird
        editor.addEventListener('dragover', function(e) {
            e.preventDefault(); // Verhindert, dass der Browser das Bild als eigene Webseite öffnet
            e.stopPropagation();
            editor.style.borderColor = '#007bff';
        });

        // Setzt den grauen Rahmen zurück, wenn das Bild den Schreibbereich verlässt
        editor.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            editor.style.borderColor = '#ccc';
        });

        // Nimmt das abgelegte Bild entgegen und verarbeitet es
        editor.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            editor.style.borderColor = '#ccc';

            const files = e.dataTransfer.files; // Liest die gedroppten Dateien aus
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    if (files[i].type.startsWith('image/')) { // Filtert ausschließlich Bilddateien heraus
                        insertImageFile(files[i]);
                    }
                }
            }
        });
    }

    // Aktualisiert die Anzahl-Anzeige auf den Ordner-Kacheln, falls wir uns auf Ordner.html befinden
    updateArchiveCount();
});

// =======================================================================================================================
// 2. EDITOR-FUNKTIONEN (Neu.html)
// =======================================================================================================================

// Führt Formatierungsbefehle aus (bold = Fett, italic = Kursiv, underline = Unterstrichen)
function execCmd(command) {
    document.execCommand(command, false, null); // Wendet den HTML-Formatierungsbefehl auf den markierten Text an
}

// Ändert dynamisch die Schriftgröße für den markierten Text oder das gesamte Feld
function changeFontSize(size) {
    const selection = window.getSelection(); // Holt die aktuelle Textauswahl des Nutzers
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const span = document.createElement('span'); // Erstellt ein Span-Element für die Schriftgröße
        span.style.fontSize = size;
        const range = selection.getRangeAt(0);
        range.surroundContents(span); // Umschließt den markierten Text mit der neuen Schriftgröße
    } else {
        const editor = document.getElementById('editorText');
        if (editor) editor.style.fontSize = size; // Setzt die Grundschriftgröße für das gesamte Feld
    }
}

// Ändert die Schriftfarbe des markierten Textes
function changeTextColor(color) {
    document.execCommand('foreColor', false, color); // Färbt den ausgewählten Text in der gewählten Hex-Farbe
}

// Hilfsfunktion zum Verarbeiten, Skalieren, Platzieren und Löschen von Bildern
function insertImageFile(file) {
    const reader = new FileReader(); // Initialisiert den Dateileser des Browsers
    reader.onload = function(e) {
        // Erstellt einen Container-Box (Wrapper) für das Bild, den Resizer und den Lösch-Button
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative'; // Ermöglicht absolute Positionierung des Lösch-Buttons
        wrapper.style.display = 'inline-block'; // Erlaubt Fließtext um den Bild-Block
        wrapper.style.resize = 'both'; // Aktiviert das stufenlose Ziehen mit der Maus an den Ecken
        wrapper.style.overflow = 'hidden'; // Schneidet Überstände beim Skalieren sauber ab
        wrapper.style.maxWidth = '100%'; // Verhindert Sprengen der Editor-Breite
        wrapper.style.width = '300px'; // Standard-Startbreite beim Einfügen
        wrapper.style.margin = '10px 0'; // Vertikaler Abstand zum Text
        wrapper.style.border = '1px dashed #bbb'; // Subtiler Rahmen als Skalierungs-Hilfe
        wrapper.style.borderRadius = '6px'; // Leicht abgerundete Ecken
        wrapper.contentEditable = 'false'; // Schutz, damit Backspace den Container gezielt löschen kann

        // Erstellt das eigentliche HTML-Bildelement
        const img = document.createElement('img');
        img.src = e.target.result; // Füllt das Bild mit den konvertierten Base64-Daten
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain'; // Behält das originale Seitenverhältnis ohne Verzerrung bei
        img.style.display = 'block';

        // Erstellt einen Schließen/Löschen-Button (runder roter Button oben rechts)
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

        // Event-Listener: Entfernt das gesamte Bild-Container-Element auf Klick
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            wrapper.remove(); // Löscht den Wrapper inklusive Bild aus dem Editor
        });

        wrapper.appendChild(img); // Fügt das Bild in den Container ein
        wrapper.appendChild(deleteBtn); // Fügt den Lösch-Button in den Container ein

        const editor = document.getElementById('editorText');
        if (editor) editor.appendChild(wrapper); // Baut den fertigen Bild-Block im Editor ein
    };
    reader.readAsDataURL(file); // Liest die Bilddatei als Daten-URL ein
}

// Liest ein Bild aus, das über das Datei-Eingabefeld ausgewählt wurde
function insertImage(input) {
    if (input.files && input.files[0]) {
        insertImageFile(input.files[0]); // Übergibt die gewählte Datei an die Verarbeitungsfunktion
    }
}

// Lädt eine bereits gespeicherte Notiz anhand ihrer ID zurück in die Editor-Felder
function loadEntryForEditing(id) {
    const archive = JSON.parse(localStorage.getItem('myFolderArchive')) || []; // Liest das Archiv aus
    const entry = archive.find(item => item.id === id); // Sucht den genauen Eintrag anhand der ID

    if (entry) {
        if (document.getElementById('datum')) document.getElementById('datum').value = entry.date;
        if (document.getElementById('thema')) document.getElementById('thema').value = entry.title;
        if (document.getElementById('tags')) document.getElementById('tags').value = entry.tags;
        if (document.getElementById('editorText')) document.getElementById('editorText').innerHTML = entry.content;

        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) saveBtn.innerText = "Änderung speichern"; // Passenden Button-Text beim Bearbeiten anzeigen
    }
}

// Speichert neue Notizen oder überschreibt aktualisierte Einträge im Browser-Speicher
function saveToArchive() {
    const datum = document.getElementById('datum').value;
    const thema = document.getElementById('thema').value.trim() || 'Unbenanntes Thema';
    const tags = document.getElementById('tags').value.trim();
    const editor = document.getElementById('editorText');
    const inhalt = editor ? editor.innerHTML : '';

    if (!inhalt || inhalt.trim() === '') {
        alert("Bitte schreibe zuerst einen Text!"); // Sicherheitsprüfung gegen leere Speicherung
        return;
    }

    let archive = JSON.parse(localStorage.getItem('myFolderArchive')) || []; // Holt vorhandene Notizen

    if (currentEditId) {
        // Bearbeitungs-Modus: Sucht die Position des Eintrags und überschreibt ihn
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
        // Neuanlage-Modus: Erstellt ein frisches Notiz-Objekt mit eindeutigem Zeitstempel
        const newEntry = {
            id: Date.now(), // Generiert eine eindeutige ID über den aktuellen Zeitstempel
            date: datum,
            title: thema,
            tags: tags,
            content: inhalt
        };
        archive.push(newEntry); // Fügt die Notiz dem Array hinzu
    }

    try {
        localStorage.setItem('myFolderArchive', JSON.stringify(archive)); // Speichert das Array als JSON-String
        alert(currentEditId ? "Änderung erfolgreich gespeichert!" : "Eintrag erfolgreich im Datumsarchiv gespeichert!");
        // Weiterleitung wurde wie gewünscht entfernt – du bleibst direkt auf der Eingabeseite!
    } catch (e) {
        alert("Der Inhalt ist zu groß für den Speicher. Bitte reduziere die Bildgrößen.");
    }
}

// =======================================================================================================================
// 3. ARCHIV- & ORDNER-FUNKTIONEN (Ordner.html)
// =======================================================================================================================

// Zählt die Anzahl der Notizen im Archiv und aktualisiert die Zahl auf den Ordner-Kacheln
function updateArchiveCount() {
    const archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];
    const countInfo = document.getElementById('archiveCountInfo');
    if (countInfo) {
        countInfo.innerText = archive.length + (archive.length === 1 ? " Eintrag" : " Einträge");
    }
}

// Öffnet die Unteransicht für das Datumsarchiv und scrollt geschmeidig dorthin
function openArchiveView() {
    const section = document.getElementById('archiveSection');
    if (section) {
        section.style.display = "block"; // Blendet den versteckten Archiv-Bereich ein
        loadArchive(); // Rendert die Liste der Einträge
        section.scrollIntoView({ behavior: 'smooth' }); // Wischt sanft nach unten zum Archiv
    }
}

// Lädt alle Notizen aus dem localStorage, sortiert sie und rendert die Notiz-Karten
function loadArchive() {
    const container = document.getElementById('archiveContainer');
    if (!container) return;

    const archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];

    if (archive.length === 0) {
        container.innerHTML = "<p style='color: #666;'>Noch keine Einträge im Archiv vorhanden.</p>";
        return;
    }

    // Liest den aktuell gewählten Wert aus dem Sortier-Dropdown aus
    const sortSelect = document.getElementById('sortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'date-desc';

    // Sortiert das Notiz-Array basierend auf der Nutzer-Auswahl
    archive.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        const tagsA = (a.tags || '').toLowerCase();
        const tagsB = (b.tags || '').toLowerCase();

        switch (sortValue) {
            case 'date-asc':
                return new Date(a.date) - new Date(b.date); // Datum: Älteste zuerst
            case 'date-desc':
                return new Date(b.date) - new Date(a.date); // Datum: Neueste zuerst
            case 'title-asc':
                return titleA.localeCompare(titleB); // Name: Alphabetisch A-Z
            case 'title-desc':
                return titleB.localeCompare(titleA); // Name: Alphabetisch Z-A
            case 'tags-asc':
                return tagsA.localeCompare(tagsB); // Tags: Alphabetisch A-Z
            case 'tags-desc':
                return tagsB.localeCompare(tagsA); // Tags: Alphabetisch Z-A
            default:
                return new Date(b.date) - new Date(a.date);
        }
    });

    // Erzeugt den HTML-Code für jeden Archiv-Eintrag dynamisch
    container.innerHTML = archive.map(item => `
        <div class="archive-card" data-tags="${item.tags || ''}" data-title="${item.title}" style="background: #fff; border-left: 4px solid #007bff; margin-bottom: 10px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">
            
            <div style="padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; background: #fafafa;">
                
                <div onclick="toggleContent(${item.id})" style="cursor: pointer; display: flex; align-items: center; gap: 15px; flex-grow: 1;">
                    <span style="font-size: 13px; font-weight: bold; color: #555;">📅 ${item.date}</span>
                    <h3 style="margin: 0; font-size: 16px; color: #222;">${item.title}</h3>
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <span onclick="toggleContent(${item.id})" style="cursor: pointer; font-size: 12px; background: #e9f2ff; color: #007bff; padding: 3px 8px; border-radius: 4px;">🏷️ ${item.tags || 'Keine Tags'}</span>
                    
                    <!-- Bearbeiten-Button -->
                    <button onclick="event.stopPropagation(); editEntry(${item.id});" title="Eintrag bearbeiten" style="background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px;">
                        ✏️
                    </button>

                    <!-- Löschen-Button -->
                    <button onclick="event.stopPropagation(); deleteEntry(${item.id});" title="Eintrag löschen" style="background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px;">
                        🗑️
                    </button>

                    <!-- Aufklapp-Pfeil -->
                    <span onclick="toggleContent(${item.id})" id="icon-${item.id}" style="cursor: pointer; font-size: 12px; color: #888; width: 15px; text-align: center;">▼</span>
                </div>

            </div>

            <!-- Eingeklappter Notiz-Inhalt -->
            <div id="body-${item.id}" style="display: none; padding: 15px; border-top: 1px solid #eee; background: #fff;">
                <div style="font-size: 14px; color: #333; line-height: 1.5;">${item.content}</div>
            </div>

        </div>
    `).join('');

    // Falls ein Suchbegriff eingegeben ist, wird der Filter direkt nach dem Sortieren erneut angewendet
    if (typeof filterArchive === "function") {
        filterArchive();
    }
}

// Blendet den Textinhalt einer Notizkarte beim Klick auf oder zu
function toggleContent(id) {
    const body = document.getElementById(`body-${id}`);
    const icon = document.getElementById(`icon-${id}`);

    if (body.style.display === "none") {
        body.style.display = "block"; // Klappt den Inhalt auf
        icon.innerText = "▲"; // Dreht das Pfeilsymbol nach oben
    } else {
        body.style.display = "none"; // Klappt den Inhalt zu
        icon.innerText = "▼"; // Dreht das Pfeilsymbol nach unten
    }
}

// Filtert die Archiv-Karten in Echtzeit basierend auf der Eingabe im Suchfeld
function filterArchive() {
    const searchInput = document.getElementById('tagSearchInput');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase(); // Wandelt Suchtext in Kleinbuchstaben um
    const cards = document.querySelectorAll('.archive-card'); // Holt alle Karten

    cards.forEach(card => {
        const tags = card.getAttribute('data-tags').toLowerCase();
        const title = card.getAttribute('data-title').toLowerCase();

        // Zeigt nur Karten an, deren Tags oder Titel den Suchbegriff enthalten
        if (tags.includes(query) || title.includes(query)) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
}

// Löscht eine einzelne Notiz aus dem localStorage nach Bestätigung
function deleteEntry(id) {
    if (confirm("Eintrag wirklich löschen?")) {
        let archive = JSON.parse(localStorage.getItem('myFolderArchive')) || [];
        archive = archive.filter(item => item.id !== id); // Filtert die gelöschte Notiz heraus
        localStorage.setItem('myFolderArchive', JSON.stringify(archive)); // Speichert das bereinigte Array
        loadArchive(); // Lädt die Liste neu
        updateArchiveCount(); // Aktualisiert die Zähler
    }
}

// Leitet den Nutzer mit der Notiz-ID zum Editor weiter, um die Notiz zu bearbeiten
function editEntry(id) {
    window.location.href = `Neu.html?edit=${id}`; // Öffnet Neu.html mit Übergabe der Notiz-ID
}