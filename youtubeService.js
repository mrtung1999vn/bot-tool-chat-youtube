const { google } = require('googleapis');

const util = require('util');
const fs = require('fs');

let liveChatId; 
let nextPage; 
const intervalTime = 5000; 
let interval; 
let chatMessages = []; 

const writeFilePromise = util.promisify(fs.writeFile);
const readFilePromise = util.promisify(fs.readFile);

const save = async (path, str) => {
  await writeFilePromise(path, str);
  console.log('Successfully Saved');
};

const read = async path => {
  const fileContents = await readFilePromise(path);
  return JSON.parse(fileContents);
};

const youtube = google.youtube('v3');
const OAuth2 = google.auth.OAuth2;

// OAuth2 cấp quyền truy cập cho web app
const clientId = '544856743297-9m4f7arhc8e9cfpm3eg3gd3d586jt12l.apps.googleusercontent.com';
const clientSecret = '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';
const redirectURI = 'http://localhost:3000/callback';

// Các quyền thiết lập cần để xem và gửi bình luận trò chuyện trực tiếp
const scope = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];

const auth = new OAuth2(clientId, clientSecret, redirectURI);

const youtubeService = {};

youtubeService.getCode = response => {
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope
  });
  response.redirect(authUrl);
};

youtubeService.getTokensWithCode = async code => {
  const credentials = await auth.getToken(code);
  youtubeService.authorize(credentials);
};

youtubeService.authorize = ({ tokens }) => {
  auth.setCredentials(tokens);
  console.log('Successfully set credentials');
  console.log('tokens:', tokens);
  save('./tokens.json', JSON.stringify(tokens));
};

youtubeService.findActiveChat = async () => {
  const response = await youtube.liveBroadcasts.list({
    auth,
    part: 'snippet',
    mine: 'true'
  });
  const latestChat = response.data.items[0];

  if (latestChat && latestChat.snippet.liveChatId) {
    liveChatId = latestChat.snippet.liveChatId;
    console.log("Chat ID Found:", liveChatId);
  } else {
    console.log("No Active Chat Found");
  }
};

auth.on('tokens', tokens => {
  if (tokens.refresh_token) {
    save('./tokens.json', JSON.stringify(auth.tokens));
    console.log(tokens.refresh_token);
  }
  console.log(tokens.access_token);
});

const checkTokens = async () => {
  const tokens = await read('./tokens.json');
  if (tokens) {
    auth.setCredentials(tokens);
    console.log('tokens set');
  } else {
    console.log('no tokens set');
  }
};

const respond = newMessages => {
  newMessages.forEach(message => {
    const messageText = message.snippet.displayMessage.toLowerCase();
    if (messageText.includes('thank')) {
      const author = message.authorDetails.displayName;
      const response = `You're welcome ${author}!`;
      youtubeService.insertMessage(response);
    }
  });
};

const getChatMessages = async () => {
  const response = await youtube.liveChatMessages.list({
    auth,
    part: 'snippet,authorDetails',
    liveChatId,
    pageToken: nextPage
  });
  const { data } = response;
  const newMessages = data.items;
  chatMessages.push(...newMessages);
  nextPage = data.nextPageToken;
  console.log('Total Chat Messages:', chatMessages.length);
  respond(newMessages);
};

youtubeService.startTrackingChat = () => {
  interval = setInterval(getChatMessages, intervalTime);
};

youtubeService.stopTrackingChat = () => {
  clearInterval(interval);
};

youtubeService.insertMessage = messageText => {
  youtube.liveChatMessages.insert(
    {
      auth,
      part: 'snippet',
      resource: {
        snippet: {
          type: 'textMessageEvent',
          liveChatId,
          textMessageDetails: {
            messageText
          }
        }
      }
    },
    () => {}
  );
};

checkTokens();

module.exports = youtubeService;
