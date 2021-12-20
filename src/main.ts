
import JitsiMeetJS from '@lyno/lib-jitsi-meet';
import JitsiParticipant from '@lyno/lib-jitsi-meet/dist/JitsiParticipant';
import JitsiTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiTrack';
import JitsiLocalTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiLocalTrack';
import { JitsiLogLevels } from '@lyno/lib-jitsi-meet/dist/JitsiLogLevels';
import { MediaType } from '@lyno/lib-jitsi-meet/dist/service/RTC/MediaType';
import JitsiConnection from '@lyno/lib-jitsi-meet/JitsiConnection';
import { JitsiConnectionEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionEvents';
import { JitsiConferenceEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceEvents';

import { JitsiMeet } from './JitsiMeet';

function showLocalTracks(jitsiMeet: JitsiMeet) {
	console.debug("addLocalTracks", "tracks:", jitsiMeet.localTracks);

	jitsiMeet.localTracks.forEach((track, i) => {
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

		if (jitsiMeet.isJoined) {
			jitsiMeet.conference.addTrack(jitsiMeet.localTracks[i]);
		}
	});
}

/**
* Handles remote tracks
* @param track JitsiTrack object
*/
function showRemoteTrack(track: JitsiTrack) {
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
		audioContainer.append(`<audio autoplay='1' muted='true' id='${participantId}audio${idx}' class='${userClass} ${trackClass}' /><!-- Track label: ${track.getTrackLabel()}-->`);
		track.attach(document.querySelector("audio." + userClass));
	} else { // Video or shared screen
		videoContainer.append(`<video autoplay='1' id='${participantId}video${idx}' class='user${participantId} ${trackClass}' /><!-- Track label: ${track.getTrackLabel()}-->`);
		track.attach(document.querySelector("video." + userClass));
	}
}

function userLeft(userId: string, user: JitsiParticipant) {
	let tracks = user.getTracks();

	console.info(`user ${userId} (${user.getDisplayName()}) left, tracks:`, tracks);

	tracks.forEach(track => {
		let type = track.getType();

		let t = type == "audio" ? "audio" : "video"; // audio is the only special case, video + desktop are both in video tags
		let el: HTMLElement = document.querySelector(t + ".user" + userId);

		console.info("detaching track", track, "from element", el);
		track.detach(el);

		track.dispose();
	});
}

let jitsiMeet: JitsiMeet;

async function main() {
	// Only meet.jit.si has been found to work by default (using BOSH). Most other instances have restrictive CORS settings. 

	jitsiMeet = new JitsiMeet(JitsiMeet.CONFIG_DOCKER);
	// jitsiMeet = new JitsiMeet(JitsiMeet.CONFIG_MEET_JIT_SI);

	let connection: JitsiConnection = jitsiMeet.connection;

	// Here we can subscribe to events for the connection
	jitsiMeet.on(JitsiConnectionEvents.CONNECTION_ESTABLISHED, () => console.log("Connection established!"));
	jitsiMeet.on(JitsiConnectionEvents.CONNECTION_FAILED, () => console.error("Connection failed :("));
	jitsiMeet.on(JitsiConnectionEvents.CONNECTION_DISCONNECTED, () => console.log("Disconnected"));

	await jitsiMeet.connect();
	// After this point the connection to the server is established, but the conference hasn't been joined yet. 

	// Subscribing to the connection events here doesn't make much sense. 
	jitsiMeet.on(JitsiConnectionEvents.CONNECTION_ESTABLISHED, () => console.log("Connected, but at what cost?")); // You're going to miss the first event because it's what triggers this code. 

	// Todo: Fix event listeners
	// One category of events particularly makes sense to subscribe to here: (these don't work yet for some reason)
	// jitsiMeet.on(JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS, () => console.log("Joining conference ... EPIC STYLE"));
	jitsiMeet.on(JitsiConferenceEvents.CONFERENCE_JOINED, () => console.log("... conference joined! EPIC STYLE"));

	// jitsiMeet.addEventListener(JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS, () => console.log("Joining conference ... Not that epic but it's something"));
	jitsiMeet.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => console.log("... conference joined! Not that epic but it's something"));

	// jitsiMeet.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS, () => console.log("Joining conference ... lame style"));
	jitsiMeet.conference.addEventListener(JitsiConferenceEvents.CONFERENCE_JOINED, () => console.log("... conference joined ... lame style"));

	await jitsiMeet.joinConference();
	// At this point the conference has been joined. The full features are available for subscription (but they also were before). 

	// Let's begin caring about the UI. 

	// Remote media
	jitsiMeet.conference.on(JitsiMeetJS.events.conference.TRACK_ADDED, track => showRemoteTrack(track)); // Show a new track that has been added (e.g. on user join)
	jitsiMeet.conference.addEventListener(JitsiConferenceEvents.USER_LEFT, (id, user) => userLeft(id, user)); // Remove a user's UI elements when they leave

	// Create local media tracks
	let tracks: JitsiLocalTrack[] = await JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] }) as JitsiLocalTrack[];
	// Add them to the jitsi meet object
	jitsiMeet.localTracks = tracks; // TODO: These tracks are barely used by Jitsi Meet, plus local and remote tracks are often handled together. Might want to unify. 

	// Display the local media tracks
	showLocalTracks(jitsiMeet);

	// Properly discard the object. May not be strictly necessary (leads to no errors on the other side), but enables us to say goodbye nicely. 
	$(window).on('beforeunload', () => jitsiMeet.dispose());

	// Mainly for debugging
	// @ts-ignore
	window.APP = jitsiMeet; // Similar to the official web app
	// @ts-ignore
	window.JitsiMeetJS = JitsiMeetJS; // useful in REPL
}
main();