# Club management Slack bot

This bot automates the management of club events by handling sign-ups, announcements, and
participant management through Slack, Google Sheets, and Google Calendar. It streamlines
communication and scheduling, ensuring that your club events are well-organised and participants
are kept informed.

## Prerequisites

Before setting up the script, make sure you have the following in place:

1. **Google Form**: Create a Google Form that participants will use to sign up for events. Ensure
   you have edit rights to this form.
2. **Calendar events**: Create the calendar events for your club. These should have the same title
   and it should be somewhat unique, that is prefer "Company Yoga Club" rather than just "Yoga".
3. **Google Group**: Set up a Google Group that includes all the participants. This group should be
   invited to all the events on your Google Calendar.

## Set up

Follow these steps to get the bot up and running:

1. **Create a Google Form**: This form will be used by participants to sign up for your club events.
   Ensure the form captures the participant's email address and has "Yes"/"No" question for whether
   the participant wants to sing up ("No" exists so participants can amend their choice)
2. **Link the Form to a Google Sheet**: Responses from the Google Form should be automatically
   linked to a Google Sheet, where the data will be stored.
3. **Copy the Script**: Open the linked Google Sheet, go to Extensions > Apps Script, and paste the
   script into the script editor.
4. **Update the constants**: Update the constants at the top of the script with your specific URLs
   and settings.
5. **Run `initialize()`**: In the Apps Script editor, run the initialize() function. This will
   create the necessary sheets (for archiving session data and responses) and set up the triggers
   needed to automate the process.

## Updating the app home

To update the [App home](https://api.slack.com/surfaces/app-home), you need to run a cURL command.

Before doing so, you will need your `user_id` and Auth token:

- `user_id`: To find you user ID, within Slack by open your profile, click the ":" button and
  choosing "Copy member ID". Then copy that ID in the value of `user_id` within app_home.json
- Auth token: You can find the token in the OAuth Tokens page (<https://api.slack.com/apps/<app_id>/oauth>)

When you have these, run the following command:

```sh
curl -X POST https://slack.com/api/views.publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d @app_home.json
```
