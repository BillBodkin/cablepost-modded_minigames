const { app, BrowserWindow, ipcMain } = require('electron');
const { Client, Authenticator } = require('minecraft-launcher-core');
const electronLog = require('electron-log');
let path = require('path');
const fs = require('fs');
const get = require("async-get-file");
const Downloader = require('nodejs-file-downloader');
let exists = require('fs-exists-sync');
const { formatWithOptions } = require('util');

const launcher = new Client();
let win = null;
let mcAuth = null;
let rootDir = app.getPath('userData');
let launcherVersion = "0.0.2";

let minMemory = "4G";
let maxMemory = "8G";

function Log(msg, popup = false){
	electronLog.log(msg);
	if(win != null){
		win.webContents.send("log", {
			msg: msg,
			popup: popup
		});
	}
	
	if(msg.includes("[main/INFO]: Stopping!")){
		setTimeout(function(){
			process.exit(0);
		}, 1000);
	}
}

function CreateWindow () {
	win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }//,
		//frame: false
	});
	win.setMenuBarVisibility(false);

	win.loadFile('index.html');
}

app.whenReady().then(() => {
	fs.writeFileSync(rootDir + "/launcherVersion.js", "let launcherVersion = " + launcherVersion + ";");
	fs.writeFileSync(rootDir + "/launcherVersion.txt", launcherVersion);
	if(exists(rootDir + "/mcAuth.json")){
		//TODO
	}
	CreateWindow();
	DownloadLauncherPage();
});

async function DownloadLauncherPage(){
	Delete(rootDir + "/launcherScreen.html");
	Delete(rootDir + "/renderer.js");
	await Sleep(100);
	Log("Downloading Launcher Screen");
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherScreen.html", {
			directory: rootDir,
			filename: "launcherScreen.html"
		}
	);
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherRenderer.js", {
			directory: rootDir,
			filename: "renderer.js"
		}
	);
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherStyle.css", {
			directory: rootDir,
			filename: "style.css"
		}
	);
	await Sleep(500);
	
	win.loadFile(rootDir + '/launcherScreen.html');
}

ipcMain.on("mojang_login", async function(event, data){
	if(mcAuth != null){
		return;
	}
	Log("Logging in...");
	try{
		mcAuth = await Authenticator.getAuth(data.username, data.password);
		if(mcAuth.selected_profile == null){
			Log("Invalid login", true);
			mcAuth = null;
			return;
		}
		if(data.save){
			fs.writeFileSync(rootDir + "/mcAuth.json", JSON.stringify(mcAuth));
		}
	}
	catch(e){
		Log("Login error: " + e, true);
		mcAuth = null;
		return;
	}
	UpdateAndPlay();
});

ipcMain.on("java_min_memory", function(event, data){
	minMemory = data;
});

ipcMain.on("java_max_memory", function(event, data){
	maxMemory = data;
});

async function UpdateAndPlay(){
	await UpdateFromJson();
	await Sleep(1000);
	Play();
}

function Sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function Play(){
	Log("Playing...");
	let opts = {
		clientPackage: null,
		authorization: mcAuth,
		root: rootDir + "/minecraft",
		version: {
			number: "1.16.5",
			type: "release",
			custom:'fabric-loader-0.11.6-1.16.5'
		},
		memory: {
			max: maxMemory,
			min: minMemory
		}
	}

	launcher.launch(opts);

	launcher.on('debug', (e) => Log(e));
	launcher.on('data', (e) => Log(e));
}

function Delete(file){
	file = path.resolve(file);
	if(exists(file)){
		fs.unlinkSync(file);
	}
}

async function UpdateFromJson(){
	Log("Deleting old files");
	Delete(rootDir + "/modpackFiles.json");
	//fs.rmdirSync(rootDir + "/minecraft", { recursive: true });
	await Sleep(100);
	Log("Downloading modpackFiles.json");
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/modpackFiles.json", {
			directory: rootDir,
			filename: "modpackFiles.json"
		}
	);
	Log("Downloaded modpackFiles.json");
	await Sleep(500);
	let modpackFiles = require(rootDir + "/modpackFiles.json");
	let modpackFilesCurrent = {
		minecraft: {}
	};
	if(exists(rootDir + "/modpackFilesCurrent.json")){
		modpackFilesCurrent = require(rootDir + "/modpackFilesCurrent.json");
	}
	await CheckFolderUpdated(rootDir + "/minecraft", modpackFiles.minecraft, modpackFilesCurrent.minecraft);
	Log("Update complete!");
}

async function CheckFolderUpdated(folder, data, dataCurrent){
	Log(folder);
	if (!exists(folder)){
		fs.mkdirSync(folder);
	}
	
	if(folder == rootDir + "/minecraft/mods"){
		//delete any mods not in JSON
		fs.readdirSync(folder).forEach(file => {
			console.log(file);
			//fs.unlinkSync(folder + "/" + file);//Uncomment later
		});
	}
	
	for(let item in data){
		if(data[item].FILE === true){
			if(dataCurrent[item] != null && data[item].version != dataCurrent[item].version){
				Log("Deleting: " + folder + "/" + item);
				Delete(folder + "/" + item);
			}
			if(!exists(path.resolve(folder + "/" + item))){
				Log("Downloading: " + data[item].url + "\nTo: " + path.resolve(folder + "/" + item));
				try{
					/*
					await get(
						data[item].url,
						{
							directory: folder,
							filename: item
						}
					);
					*/
					const downloader = new Downloader({
						url: data[item].url,
						directory: folder,
						fileName: item,
						cloneFiles: false
					});
					await downloader.download();
				}
				catch(e){
					Log("Error downloading", data[item].url, e);
					throw e;
				}
			}
			else{
				Log("Got file " + folder + "/" + item);
			}
		}
		else{
			let nextCurrentData = {};
			if(dataCurrent[item] != null){
				nextCurrentData = dataCurrent[item];
			}
			await CheckFolderUpdated(folder + "/" + item, data[item], nextCurrentData);
		}
	}
	
	fs.copyFileSync(rootDir + "/modpackFiles.json", rootDir + "/modpackFilesCurrent.json");
}