# Basic HTML Example

This static example shows the smallest possible integration:

- pick a local DOCX, XLSX, or PPTX file;
- generate a random AES-256 key in the browser;
- encrypt the file using the protocol format;
- expose encrypted bytes through a Blob URL;
- open cryptee-editor in an iframe;
- receive `editor:saved` and offer encrypted bytes for download.

Build the editor first, then open `index.html` through a local static server.

