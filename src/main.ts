
import JitsiMeetJS from '@lyno/lib-jitsi-meet';
import JitsiParticipant from '@lyno/lib-jitsi-meet/dist/JitsiParticipant';
import JitsiTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiTrack';
import { MediaType } from '@lyno/lib-jitsi-meet/dist/service/RTC/MediaType';
import { JitsiConnectionEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionEvents';
import { JitsiConferenceEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceEvents';

import { JitsiMeet } from './JitsiMeet';

function showLocalTracks(jitsiMeet: JitsiMeet) {
	console.debug("addLocalTracks", "tracks:", jitsiMeet.localTracks);

	let i = 0;
	jitsiMeet.localTracks.forEach((track) => {
		// Add tracks to body
		console.log("Showing track", track);
		if (track.getType() === MediaType.VIDEO) {
			$('body').append(`<video autoplay='1' id='localVideo${i}' class='local ${i}' />`);
			track.attach($(`#localVideo${i}`)[0]);
		} else if (track.getType() === MediaType.AUDIO) {
			$('body').append(`<audio autoplay='1' muted='true' id='localAudio${i}' class='local ${i}' />`);
			track.attach($(`#localAudio${i}`)[0]);
			// @ts-ignore
		} else if (track.getType() === 'desktop') {
			$('body').append(`<video autoplay='1' id='localDesktop${i}' class='local ${i}'/>`);
			track.attach($(`#localDesktop${i}`)[0]);
		}

		jitsiMeet.conference?.addTrack(jitsiMeet.localTracks[i]);
		i++;
	});
}

/**
* Handles remote tracks
* @param track JitsiTrack object
*/
function showTrack(track: JitsiTrack) {
	console.debug("showRemoteTrack", track);

	// This function is also called for local tracks. We don't want to deal with those. 
	if (track.isLocal()) { return; }

	// @ts-ignore
	const participantId: string = track.getParticipantId();
	console.log("Remote track from participant:", participantId)

	// Add this track to the list of known tracks if it's not already in it
	if (!jitsiMeet.remoteTracks[participantId]) {
		jitsiMeet.remoteTracks[participantId] = [];
	}
	const idx = jitsiMeet.remoteTracks[participantId].push(track);

	let audioContainer = $("body");
	let videoContainer = $("body");

	let userClass = "user" + participantId;
	let trackClass = track.getTrackId();

	if (track.getType() === MediaType.AUDIO) {
		audioContainer.append(`<audio autoplay='1' muted='true' id='${participantId}audio${idx}' class='${userClass} ${trackClass}' />`);
		track.attach(document.querySelector("audio." + userClass));
	} else { // Video or shared screen
		videoContainer.append(`<video autoplay='1' id='${participantId}video${idx}' class='user${participantId} ${trackClass}' />`);
		track.attach(document.querySelector("video." + userClass));
	}
}

function removeTrack(track: JitsiTrack) {
	let containers: HTMLElement[]
		// @ts-ignore // The containers property is not in the Typescript definition yet
		= track.containers;

	containers.forEach(container => {
		console.debug(`Removing track ${track.getTrackLabel()} from UI `, container)

		track.detach(container);
		container.remove(); // Remove from DOM
		track.dispose();
	});
}

let jitsiMeet: JitsiMeet;

async function main() {
	// Only meet.jit.si has been found to work by default (using BOSH). Most other instances have restrictive CORS settings. 

	let roomName = "TalentedBlocksGetThis";

	// let config = JitsiMeet.CONFIG_MEET_JIT_SI;
	// Because the public Jitsi Meet instance does extra routing on connection based on the room name, it needs to be supplied earlier than ususal.
	// config.connectionOptions.roomName = roomName; // This property overrides the room name used on joinConference(). Setting both produces a warning. 

	let config = JitsiMeet.CONFIG_DOCKER;
	// Main address. <your server>/http-bind
	// config.connectionOptions.serviceUrl = "https://localhost:8443/http-bind";

	jitsiMeet = new JitsiMeet(config);

	// You could subscribe to connection events here, but you can also just catch the errors instead. 
	// jitsiMeet.addEventListener(JitsiConnectionEvents.CONNECTION_ESTABLISHED, () => console.log("Connected!"));

	var connectionEventListeners = new Map([
		[JitsiConnectionEvents.CONNECTION_DISCONNECTED, () => console.log("Disconnected from the server")],
		// [JitsiConnectionEvents.CONNECTION_ESTABLISHED, () => console.log("Connection established")], // The await would succeed
		// [JitsiConnectionEvents.CONNECTION_FAILED, () => console.log("Connection failed")], // The await would fail
	]);
	
	// Returns the user's id if the connection was successful and throws an error if it was not. 
	await jitsiMeet.connect(connectionEventListeners);

	// After this point the connection to the server is established, but the conference hasn't been joined yet. 
	console.log("Connected to the server!");

	var conferenceEventListeners = new Map([
		[JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS, () => console.log("Joining conference ...")],
		[JitsiConferenceEvents.CONFERENCE_JOINED, () => console.log("... conference joined")],

		// These can also be added using jitsiMeet.conference.addEventListener and removed with jitsiMeet.conference.removeEventListener
		[JitsiConferenceEvents.USER_JOINED, (usr, user: JitsiParticipant) => console.log(`User ${usr} joined (display name: ${user.getDisplayName()})`),],
		[JitsiConferenceEvents.USER_LEFT, (usr) => console.log(`User ${usr} left`)],
		[JitsiConferenceEvents.MESSAGE_RECEIVED, (usr: string, msg) => console.log(`Received message from user ${usr}: ${msg}`)],
		[JitsiConferenceEvents.KICKED, () => console.log("Kicked :(")],

		[JitsiConferenceEvents.TRACK_ADDED, track => showTrack(track)], // Show a new track that has been added (e.g. on user join)
		[JitsiConferenceEvents.TRACK_REMOVED, track => removeTrack(track)], // Remove a user's UI elements when they leave

		[JitsiConferenceEvents.CONFERENCE_JOINED, async () => {
			// Create local media tracks
			await jitsiMeet.createLocalTracks();

			// Display the local media tracks
			showLocalTracks(jitsiMeet);
		}],

	]);

	await jitsiMeet.joinConference(roomName, conferenceEventListeners);

	// At this point the conference has been joined and the connection is all ready. 

	// Properly discard the object. May not be strictly necessary (leads to no errors on the other side), but enables us to say goodbye nicely. 
	$(window).on('beforeunload', () => jitsiMeet.dispose());

	// Mainly for debugging
	// @ts-ignore
	window.APP = jitsiMeet; // Similar to the official web app
	// @ts-ignore
	window.JitsiMeetJS = JitsiMeetJS; // useful in REPL
}

main().catch((e) => { alert(e); console.log(e) });