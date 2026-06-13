# TODO

## Image + Caption Bulk WhatsApp

- [x] Update frontend UI to let user select an image.
- [x] Add frontend upload flow to send image to backend (`/api/upload-image`) once per campaign.
- [x] Update frontend broadcast calls (`/api/broadcast` and `/api/schedule-broadcast`) to include returned `imageRef`.
- [x] Update backend: add `/api/upload-image` endpoint (multer to `uploads/`).
- [x] Update backend broadcast loop to send image with caption (template evaluated per record).
- [x] Update backend scheduling job + background dispatch to reuse `imageRef` and send image with caption.
- [ ] Quick test run: start backend, validate instant broadcast payload and scheduled broadcast payload.


