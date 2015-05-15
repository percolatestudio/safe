Package.describe({
  summary: "PS API/Extensions for validation, type safety and error checking/display."
});

Package.on_use(function (api, where) {
  api.use(['check', 'underscore', 'aldeed:simple-schema', 'flash-notifications']);
  api.add_files(['safe.js', 
    'errors.js', 'simple-schema-ext.js'], ['client', 'server']);
  api.export(['Safe'], ['client', 'server']);
});
