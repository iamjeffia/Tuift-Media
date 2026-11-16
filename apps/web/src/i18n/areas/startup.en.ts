/** English messages of what the server says about its own start-up. See ../README.md. */
export const startupEn = {
  // The notice tray, after the server found its database damaged and put it right
  'startup.database.restored':
    'Your chat database was damaged. It was restored from the backup of {date}.',
  'startup.database.restoredDetail':
    'The damaged file was kept at {path}. Chats written after that backup are not in the restored copy.',
  'startup.database.empty':
    'Your chat database was damaged and no backup could be used, so TUIFT Code started empty.',
  'startup.database.emptyDetail': 'The damaged file was kept at {path}. Nothing was deleted.',

  // Session search while the server rebuilds its index after an update
  'startup.search.indexing':
    'Still updating the search index after an update. Results may be incomplete for now.',
} as const
