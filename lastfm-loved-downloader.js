
import fs from "fs";
import { execSync } from 'child_process'
import YTMusic from "ytmusic-api";
import { accessSync, constants } from "fs";


const config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));

function convertToValidFilename(string) {
  return (string.replace(/[\/|\\:*?"<>]/g, " "));
}

function escapeShellArg(arg) {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}



const doSleep = async function (delayInSeconds) {
  await new Promise(resolve => setTimeout(resolve, 1000 * delayInSeconds));
}

const lastFmGetLovedSongsPage = async function (page) {

  const json = await (await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getLovedTracks&user=${config.lastFmUser}&page=${page}&limit=50&api_key=${config.lastFmApiKey}&format=json`)).json();

  const lastFmLovedSongs = json.lovedtracks.track.map((element, index, array) => {
    return {
      'name': element.name,
      'artist': element.artist.name
    }
  });

  const totalPages = json.lovedtracks['@attr'].totalPages;

  return [lastFmLovedSongs, totalPages]
}

/*
Read loved songs from last.fm
*/

const lastFmLovedSongs = [];

let lastFmLovedSongsPage = 1
let lastFmLovedSongsRemainingPages = 0;

do {
  await doSleep(0.5);
  let [lovedSongs, totalPages] = await lastFmGetLovedSongsPage(lastFmLovedSongsPage);

  lastFmLovedSongs.push(...lovedSongs);

  lastFmLovedSongsRemainingPages = totalPages - lastFmLovedSongsPage;
  lastFmLovedSongsPage++;

} while (lastFmLovedSongsRemainingPages > 0);

console.log(`*** Fetched ${lastFmLovedSongs.length} loved songs for last.fm user ${config.lastFmUser} ***`);


/*
Search and download audio from youtube music using yt-dlp
*/
const ytmusic = new YTMusic();
await ytmusic.initialize();

let count = 1;

for (let index = 0; index < lastFmLovedSongs.length; index++) {

  const lovedSong = lastFmLovedSongs[index];

  const filePath = `${config.outputDirectory}${convertToValidFilename(lovedSong.artist)} - ${convertToValidFilename(lovedSong.name)}.opus`

  try {
    accessSync(filePath, constants.F_OK);
    console.log(`[${index + 1}/${lastFmLovedSongs.length}] - Skipping ${lovedSong.name} for artist ${lovedSong.artist} as it's already downloaded ...`)
    count++;
  } catch (err) {

    await ytmusic.searchSongs(`${lovedSong.artist} ${lovedSong.name}`).then(async songs => {

      await doSleep(1);

      console.log(`[${index + 1}/${lastFmLovedSongs.length}] - Downloading ${lovedSong.name} for artist ${lovedSong.artist} ...`);

      execSync(`yt-dlp --cookies-from-browser brave --embed-thumbnail --convert-thumbnails png --embed-metadata -f bestaudio --extract-audio --audio-quality 0 --audio-format opus -o ${escapeShellArg(filePath)} https://music.youtube.com/watch?v=${songs[0].videoId}`, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
      });

      await doSleep(1);
    })
  }
}