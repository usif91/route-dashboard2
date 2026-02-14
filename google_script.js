function doGet(e) {
    var params = e.parameter;
    var action = params.action;

    // Handle nickname operations
    if (action === 'getNicknames') {
        return getNicknames();
    } else if (action === 'setNickname') {
        return setNickname(params.deviceId, params.nickname);
    }

    // Original logging and viewing functionality
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Logs') || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // If we have a 'query' parameter, it's a LOGGING request
    if (params.query) {
        var timestamp = new Date().toISOString();

        // Add header if missing (Updated schema)
        if (sheet.getLastRow() === 0) {
            sheet.appendRow(["Timestamp", "IP (Simulated)", "Name (Manual)", "Query", "Top Result", "Intersection", "Location", "6-Car Plan"]);
        }

        sheet.appendRow([
            timestamp,
            "Client",
            params.user || "Anonymous",
            params.query,
            params.topResultSummary || "",
            params.intersection || "",
            params.location || "",
            params.sixCar || ""
        ]);

        // Return JSON success
        return ContentService.createTextOutput(JSON.stringify({ status: "logged" }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // Otherwise, it's a VIEW request (Admin Dashboard)
    var rows = sheet.getDataRange().getValues();

    // Handle empty sheet case
    if (rows.length < 2) {
        return ContentService.createTextOutput(JSON.stringify([]))
            .setMimeType(ContentService.MimeType.JSON);
    }

    var data = rows.slice(1);
    var logs = data.map(function (row) {
        return {
            timestamp: row[0],
            ip: row[1],
            user: row[2],
            query: row[3],
            topResultSummary: row[4],
            intersection: row[5],
            location: row[6],
            sixCar: row[7]
        };
    });

    return ContentService.createTextOutput(JSON.stringify(logs.reverse()))
        .setMimeType(ContentService.MimeType.JSON);
}

function getNicknames() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nicknameSheet = ss.getSheetByName('Nicknames');

    // Create the Nicknames sheet if it doesn't exist
    if (!nicknameSheet) {
        nicknameSheet = ss.insertSheet('Nicknames');
        nicknameSheet.appendRow(['Device ID', 'Nickname', 'Last Updated']);
        nicknameSheet.setFrozenRows(1);
    }

    var rows = nicknameSheet.getDataRange().getValues();

    // Skip header row
    if (rows.length < 2) {
        return ContentService.createTextOutput(JSON.stringify({}))
            .setMimeType(ContentService.MimeType.JSON);
    }

    var nicknames = {};
    for (var i = 1; i < rows.length; i++) {
        var deviceId = rows[i][0];
        var nickname = rows[i][1];
        if (deviceId && nickname) {
            nicknames[deviceId] = nickname;
        }
    }

    return ContentService.createTextOutput(JSON.stringify(nicknames))
        .setMimeType(ContentService.MimeType.JSON);
}

function setNickname(deviceId, nickname) {
    if (!deviceId) {
        return ContentService.createTextOutput(JSON.stringify({ error: "Device ID required" }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nicknameSheet = ss.getSheetByName('Nicknames');

    // Create the Nicknames sheet if it doesn't exist
    if (!nicknameSheet) {
        nicknameSheet = ss.insertSheet('Nicknames');
        nicknameSheet.appendRow(['Device ID', 'Nickname', 'Last Updated']);
        nicknameSheet.setFrozenRows(1);
    }

    var rows = nicknameSheet.getDataRange().getValues();
    var deviceRow = -1;

    // Find if device already has a nickname
    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === deviceId) {
            deviceRow = i + 1; // +1 because rows are 1-indexed in Sheets
            break;
        }
    }

    var timestamp = new Date().toISOString();

    if (deviceRow > 0) {
        // Update existing row
        if (nickname && nickname.trim()) {
            nicknameSheet.getRange(deviceRow, 2).setValue(nickname.trim());
            nicknameSheet.getRange(deviceRow, 3).setValue(timestamp);
        } else {
            // Delete row if nickname is empty
            nicknameSheet.deleteRow(deviceRow);
        }
    } else if (nickname && nickname.trim()) {
        // Add new row
        nicknameSheet.appendRow([deviceId, nickname.trim(), timestamp]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    // Fallback to doGet logic if someone sends POST
    return doGet(e);
}
