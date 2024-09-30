//========================== CONFIG ==================================//
// API hooks
// hook to send to main club slack channel
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/<hookURL>';
// hook to send to testing slack channel
const SLACK_TEST_WEBHOOK_URL = 'https://hooks.slack.com/services/<hookURL>';

// URLs
// link to the edit view of the google form
const GOOGLE_FORM_EDIT_URL = 'https://docs.google.com/forms/d/<form_id>/edit';
// link to the url for people to fill in the form
const GOOGLE_FORM_SEND_URL = 'https://docs.google.com/forms/d/e/<id>/viewform?usp=sf_link';
// link to the google group invited to the events
const GOOGLE_GROUP_URL = 'https://groups.google.com/a/<group>';

// Constants
// The name of the club to use in messages
const CLUB_NAME = 'Yoga';
// The slack emoji to use for the club in messages
const CLUB_EMOJI = ':yoga:';
// The name of the calendar events of the club
const CALENDAR_EVENT_TITLE = 'Yoga Club';
// Maximum number of participants allowed per session
const MAX_PARTICIPANTS = 10;
// Number of days before the event to send sign-up invitation
const DAYS_BEFORE_SIGNUP = 3;
// Number of days before the event to announce participants
const DAYS_BEFORE_ANNOUNCEMENT = 1;
// Name of the Google Sheet that contains the participants (default would be 'Form responses 1')
const GOOGLE_SHEET_NAME_FORM_RESPONSES = 'Form responses 1';
// Whether or not the sign up message should contain @channel
const SHOULD_SIGNUP_AT_CHANNEL = true;

//========================== MAIN SCRIPT ==================================//

// test mode toggle
const TEST_MODE = false;

// internal config
const EMAIL_SUFFIX = '@example.com';
const TRIGGER_EVERY_HOURS = 1;
const HOURS_OFFSET_FOR_MESSAGES = 2;
const GOOGLE_SHEET_NAME_SESSIONS_ARCHIVE = 'Sessions Archive';
const GOOGLE_SHEET_NAME_RESPONSES_ARCHIVE = 'Responses Archive';
const STATUS_SENT = 'sent';

function initialize() {
  // ensure correct constants
  if (DAYS_BEFORE_SIGNUP <= DAYS_BEFORE_ANNOUNCEMENT) {
    Logger.log('DAYS_BEFORE_SIGNUP should be greater than DAYS_BEFORE_ANNOUNCEMENT.');
    return;
  }

  // Test that the GOOGLE_SHEET_NAME_FORM_RESPONSES exists
  const responsesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_FORM_RESPONSES);
  if (!responsesSheet) {
    Logger.log(GOOGLE_SHEET_NAME_FORM_RESPONSES + ' sheet not found.');
    return;
  }

  // Test that GOOGLE_FORM_EDIT_URL works
  try {
    FormApp.openByUrl(GOOGLE_FORM_EDIT_URL);
  } catch (e) {
    Logger.log('Failed to open form at ' + GOOGLE_FORM_EDIT_URL + ': ' + e.message);
    return;
  }

  // Create sheets if they don't exist
  let sessionsArchiveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_SESSIONS_ARCHIVE);
  if (!sessionsArchiveSheet) {
    Logger.log(GOOGLE_SHEET_NAME_SESSIONS_ARCHIVE + ' sheet not found. Creating it');
    sessionsArchiveSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(GOOGLE_SHEET_NAME_SESSIONS_ARCHIVE);
    // Add headers: event date, participant1, participant2, ... participantMAX_PARTICIPANTS, waitlist
    const headers = ['Event Date'];
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      headers.push('Participant ' + i);
    }
    headers.push('Waitlist');
    sessionsArchiveSheet.appendRow(headers);
  }

  let responsesArchiveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_RESPONSES_ARCHIVE);
  if (!responsesArchiveSheet) {
    Logger.log(GOOGLE_SHEET_NAME_RESPONSES_ARCHIVE + ' sheet not found. Creating it');
    responsesArchiveSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(GOOGLE_SHEET_NAME_RESPONSES_ARCHIVE);
    responsesArchiveSheet.appendRow([
      'Timestamp',
      'Email address',
      'Do you want to sign up for ' + CLUB_NAME + ' this week?',
    ]);
  }

  // Set up a trigger to check and send messages every hour
  clearAllTriggers();
  ScriptApp.newTrigger('checkAndSendMessages').timeBased().everyHours(TRIGGER_EVERY_HOURS).create(); // Check every hour if it's time to send a message
}

function checkAndSendMessages() {
  const event = getNextEvent();
  if (!event) {
    return;
  }
  const eventDate = event.getStartTime();
  Logger.log('Next event: ' + event.getTitle() + ' on ' + formatDate(eventDate));

  // Calculate the dates when to send the sign-up and announcement messages
  // It's set 2 hours before the event
  const signupDate = new Date(
    eventDate.getTime() - (DAYS_BEFORE_SIGNUP * 24 + HOURS_OFFSET_FOR_MESSAGES) * 60 * 60 * 1000
  );
  const announcementDate = new Date(
    eventDate.getTime() - (DAYS_BEFORE_ANNOUNCEMENT * 24 + HOURS_OFFSET_FOR_MESSAGES) * 60 * 60 * 1000
  );
  // Adjust dates if they fall on a weekend
  ifDateInWeekendSetToPreviousFriday(signupDate);
  ifDateInWeekendSetToPreviousFriday(announcementDate);

  // Ensure signupDate and announcementDate are not the same day
  if (signupDate.toDateString() === announcementDate.toDateString()) {
    Logger.log('Signup and announcement dates are the same. Adjusting signup date.');
    signupDate.setDate(signupDate.getDate() - 1);
  }

  Logger.log('signupDate: ' + formatDate(signupDate));
  Logger.log('announcementDate: ' + formatDate(announcementDate));

  const now = new Date();
  // Send the sign-up invite if it's time and hasn't been sent yet
  if (now >= signupDate && now < announcementDate && !isMessageSent('sign-up', eventDate)) {
    Logger.log('Sending send signup invite');
    sendSignupInvite(eventDate);
    markMessageAsSent('sign-up', eventDate);
    Logger.log('Signup invite sent and marked as such');
  }

  // Send the announcement if it's time and hasn't been sent yet
  if (now >= announcementDate && now < eventDate && !isMessageSent('announcement', eventDate)) {
    Logger.log('Announcing and archiving participants');
    announceArchiveParticipants(event);
    markMessageAsSent('announcement', eventDate);
    Logger.log('Announcement sent and marked as such');
  }
}

function announceArchiveParticipants(event) {
  const eventDate = event.getStartTime();
  const { participants, waitlist } = getParticipantsAndWaitlist();

  const taggedParticipants = participants.map(function (participant) {
    return '@' + participant;
  });
  const taggedWaitlist = waitlist.map(function (waitlister) {
    return '@' + waitlister;
  });

  let announcementMessage =
    '🎉 Here are the participants for the ' +
    CLUB_NAME +
    ' session on *' +
    formatDate(eventDate) +
    '*: ' +
    taggedParticipants.join(', ');

  if (waitlist.length > 0) {
    announcementMessage += '\nWaitlist: ' + taggedWaitlist.join(', ') + '.';
  } else {
    const noOfEmptySpots = MAX_PARTICIPANTS - participants.length;
    announcementMessage += ` (${noOfEmptySpots} empty ${noOfEmptySpots === 1 ? 'spot' : 'spots'}, no waitlist).`;
  }

  announcementMessage +=
    "\nNeed to drop out? Please @tag the next person in the list.\nHaven't filled the form yet? Just comment on the thread so if someone drops out they know to ping you.";

  saveSessionData(eventDate, participants, waitlist);
  sendSimpleSlackMessage(announcementMessage);
  addParticipantsToEvent(participants, event);
  clearFormResponses();
}

function clearFormResponses() {
  const formResponsesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_FORM_RESPONSES);
  if (!formResponsesSheet) {
    Logger.log(GOOGLE_SHEET_NAME_FORM_RESPONSES + ' sheet is not found.');
    return;
  }
  const archiveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_RESPONSES_ARCHIVE);

  // Get the data from the form responses sheet (everything below row 1)
  const dataRange = formResponsesSheet.getRange(
    2,
    1,
    formResponsesSheet.getLastRow() - 1,
    formResponsesSheet.getLastColumn()
  );
  const data = dataRange.getValues();

  // Append the data to the backup sheet
  if (data.length > 0) {
    // leave an empty row
    archiveSheet.getRange(archiveSheet.getLastRow() + 2, 1, data.length, data[0].length).setValues(data);
  }

  // Clear the data from the form responses sheet
  dataRange.clearContent();
  dataRange.clearNote();

  const form = FormApp.openByUrl(GOOGLE_FORM_EDIT_URL);
  form.deleteAllResponses();
}

function getParticipantsAndWaitlist() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_FORM_RESPONSES);
  if (!sheet) {
    Logger.log(GOOGLE_SHEET_NAME_FORM_RESPONSES + ' sheet not found.');
    return;
  }
  const data = sheet.getDataRange().getValues();
  // Remove the header row
  data.shift();
  const yesResponses = data.filter((row) => row[2].toLowerCase() === 'yes');
  // Sort by Timestamp (first column, which is index 0)
  yesResponses.sort((a, b) => new Date(a[0]) - new Date(b[0]));

  const participants = yesResponses.slice(0, MAX_PARTICIPANTS);
  const waitlist = yesResponses.slice(MAX_PARTICIPANTS);

  // extract the names and remove @domain.com suffix
  const participantHandles = participants.map((row) => row[1].split('@')[0]);
  const waitlistHandles = waitlist.map((row) => row[1].split('@')[0]);

  return {
    participants: participantHandles,
    waitlist: waitlistHandles,
  };
}

function sendSignupInvite(eventDate) {
  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            CLUB_EMOJI +
            ' ' +
            (SHOULD_SIGNUP_AT_CHANNEL ? '@channel ' : '') +
            CLUB_NAME +
            ' session coming up on *' +
            formatDate(eventDate) +
            '*! Please fill out the form to join:',
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: ':google-forms: Form',
            emoji: true,
          },
          value: 'click_me_123',
          url: GOOGLE_FORM_SEND_URL,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text:
              'You can see all ' +
              CLUB_NAME +
              ' events in your calendar by joining the <' +
              GOOGLE_GROUP_URL +
              '| :google-groups: ' +
              CLUB_NAME +
              ' Google Group>',
          },
        ],
      },
    ],
  };
  sendSlackPayload(payload);
}

// Utility functions

function addParticipantsToEvent(participants, event) {
  const participantEmails = participants.map((username) => username + EMAIL_SUFFIX);
  participantEmails.forEach((email) => {
    event.addGuest(email);
  });
  Logger.log('Added participants to the event: ' + participantEmails.join(', '));
}

function getNextEvent() {
  const now = new Date();
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const events = CalendarApp.getDefaultCalendar().getEvents(now, twoWeeksFromNow, { search: CALENDAR_EVENT_TITLE });

  if (events.length === 0) {
    Logger.log('No upcoming events found.');
    return null;
  }
  return events[0]; // Assuming the first event in the list is the next event
}

function saveSessionData(eventDate, participants, waitlist) {
  const archiveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_NAME_SESSIONS_ARCHIVE);
  const rowData = [eventDate.toISOString()].concat(participants).concat(waitlist); // Combine session date, participants, and waitlist

  archiveSheet.appendRow(rowData);
}

function ifDateInWeekendSetToPreviousFriday(eventDate) {
  if (eventDate.getDay() === 6) {
    // Saturday
    eventDate.setDate(eventDate.getDate() - 1); // Move to Friday
  } else if (eventDate.getDay() === 0) {
    // Sunday
    eventDate.setDate(eventDate.getDate() - 2); // Move to Friday
  }
}

function clearAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => {
    ScriptApp.deleteTrigger(trigger);
  });
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "EEEE, d MMMM 'at' H:mm");
}

function sendSimpleSlackMessage(message) {
  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ],
  };
  sendSlackPayload(payload);
}

function sendSlackPayload(payload) {
  const webhook = TEST_MODE ? SLACK_TEST_WEBHOOK_URL : SLACK_WEBHOOK_URL;
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  };
  UrlFetchApp.fetch(webhook, options);
}

function isMessageSent(type, eventDate) {
  const scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty(type + '-' + eventDate.toISOString()) === STATUS_SENT;
}

function markMessageAsSent(type, eventDate) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty(type + '-' + eventDate.toISOString(), STATUS_SENT);
}
