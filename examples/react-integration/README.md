# React Integration Example

This example exposes a reusable `<CrypteeEditor />` iframe component. It demonstrates:

- constructing a protocol URL from React props;
- filtering `postMessage` by editor origin;
- mapping `editor:saved` to an `onSave` callback;
- keeping mock storage outside the editor component.

In a real application, replace the mock URL and key with values produced by your storage and encryption layer.

