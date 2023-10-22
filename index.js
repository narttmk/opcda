const opcda = require('node-opc-da');
const {
  OPCServer,
  dcom: { Session, ComServer, Clsid },
} = opcda;
const fs = require('fs')
const clsid = 'F8582CF2-88FB-11D0-B850-00C0F0104305';
const username = 'vmo';
const password = '12';
const address = '172.16.3.198';
const domain = 'VMO-PC';
const retryTime = 3;
const timeout = 5000;

let comSession = new Session();
let opcServer;

async function connect(retry = 0) {
  if (retry < retryTime) {
    try {
      console.log('Connecting...');
      comSession = comSession.createSession(domain, username, password);

      // sets a global timeout for connections related to this session
      comSession.setGlobalSocketTimeout(timeout);

      // create a COM Server from a classid, an IP address and the previously created session
      let comServer = new ComServer(new Clsid(clsid), address, comSession);

      // star the COM Server
      await comServer.init();

      /* from the COM Server, we create a instance we'll use to create every other COM related object */
      let comObject = await comServer.createInstance();

      // with the comObjet created, we create an OPC Server object and call init()
      opcServer = new OPCServer();
      await opcServer.init(comObject);
      console.log('connected');
    } catch (error) {
      console.trace(error);
      console.log(`reconnecting ${retry + 1} time`);
      connect(retry + 1);
    }
  }
}

async function browseItems() {
  let opcBrowser = await opcServer.getBrowser();
  let items = await opcBrowser.browseAllTree();
  // let items = await opcBrowser.browseAllFlat();
  fs.writeFileSync('data.json', JSON.stringify(convertData(items)))
}

async function getItem(ids) {
  let opcGroup = await opcServer.addGroup('dataGroup', null);
  let opcItemManager = await opcGroup.getItemManager();
  let handle = 1;
  const items = [];
  for (let id of ids) {
    items.push({
      itemID: id,
      clientHandle: handle++,
    });
  }
  const serverHandlers = [];
  const addedItems = await opcItemManager.add(items);
  console.log(addedItems);
  for (const addedItem of addedItems) {
    serverHandlers.push(addedItem[1].serverHandle);
  }
  let opcSyncIO = await opcGroup.getSyncIO();
  let value = await opcSyncIO.read(
    opcda.constants.opc.dataSource.DEVICE,
    serverHandlers
  );
  console.log('value', value);
}

async function main() {
  try {
    await connect(0);
    await getItem(['Random.String', 'Random.Time', 'Random.Money']);
    // await browseItems();
    comSession.close();
    opcServer.end()
  } catch (error) {
    console.trace(error);
  }
}

const iconPath = {
  folder: '/src/assets/images/icons/icon-desktop.svg',
  tag: '/src/assets/images/icons/icon-tag.svg',
  activeTag: '/src/assets/images/icons/icon-tag-active.svg',
};

function convertData(tags, root) {
  let result = [];
  for (const field in tags) {
    console.log(field)
    const path = (root ? root + '/' : '') + field;
    const tag = {
      title: field,
      path,
      dataType: null,
    };
    if (typeof tags[field] === 'object') {
      tag.id = field;
      if (!root) {
        tag.icon = iconPath.folder;
      }
      tag.children = convertData(tags[field], path);
    } else {
      tag.id = tags[field];
      tag.icon = iconPath.tag;
      tag.iconActive = iconPath.activeTag;
    }
    result.push(tag)
  }
  return result;
}
main();
