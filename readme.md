# lib-jitsi-meet-demo
High level abstraction and demo application in Typescript for [(@lyno/)lib-jitsi-meet/JitsiMeetJS](https://github.com/lynoapp/lib-jitsi-meet). 

lib-jitsi-meet (also known as JitsiMeetJS) is a powerful library, but I found it non-trivial to start with, so I made a high level abstraction and demo application in Typescript to make it easier to get started with. 

I may expand this documentation in the future, but the code is quite well commented and should provide everything you need to get started.

The JitsiMeet class contains a high level abstraction for the basic functionality of lib-jitsi-meet. main.ts creates the UI and instruments its JitsiMeet instance. 

The JitsiMeet class has the properties `connection` and `conference`, which provide access to their respective JitsiMeetJS objects. 

## Running

`npm install` installs the packages the project depends on (most notably [@lyno/lib-jitsi-meet](https://github.com/lynoapp/lib-jitsi-meet))

`npm start` starts a webpack dev server on [https://localhost:9000/](https://localhost:9000/). 

`npm build` creates a shippable bundle.js in the dist/ folder