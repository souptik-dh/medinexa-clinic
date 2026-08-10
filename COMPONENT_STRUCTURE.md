# Branch Image Management - Component Structure

## Component Hierarchy

```
ClinicsPanel
├── Branch Table (showing branches)
│   └── Branch Row
│       ├── Branch Name (Clickable)
│       ├── Edit Button (if canUpdateBranch)
│       └── Delete Button (if canDeleteBranch)
│
└── BranchGalleryPanel (Shown when branch selected)
    ├── Header
    │   ├── Gallery Title
    │   └── Add Image Button (if canUpdateBranch)
    │
    ├── Error Display (if error state)
    │
    └── Gallery Content
        ├── Loading State (spinner)
        ├── Empty State (no images message)
        └── Image Grid
            ├── Image 1
            │   ├── Image Preview
            │   ├── Upload Date (bottom)
            │   └── Delete Button on Hover (if canDeleteBranch)
            ├── Image 2
            │   └── ...
            └── Image N
                └── ...
```

## State Management

### ClinicsPanel State:
```typescript
- clinics: Clinic[]                    // All clinics
- selected: Clinic | null              // Selected clinic
- selectedBranch: Branch | null        // Selected branch (NEW)
- branches: Branch[]                   // Branches of selected clinic
- loading: boolean                     // Loading clinics
- branchesLoading: boolean             // Loading branches
- error: string | null                 // Error message
- busy: boolean                        // Operation in progress
```

### BranchGalleryPanel State:
```typescript
- images: BranchGalleryImage[]         // Gallery images
- loading: boolean                     // Loading gallery
- uploading: boolean                   // Uploading image
- error: string | null                 // Error message
- deleting: string | null              // Image being deleted
```

## Permission Flow

```
User Action → Permission Check → UI Update

Upload Image:
  User clicks "Add Image"
    ↓
  Check: canUpdateBranch(permissions)
    ├─ True  → Show file input, enable upload
    └─ False → Hide button, disable upload

Delete Image:
  User hovers over image
    ↓
  Check: canDeleteBranch(permissions)
    ├─ True  → Show delete button
    └─ False → Hide delete button

View Gallery:
  Gallery always visible (read-only if no permissions)
```

## API Call Flow

### Upload Image:
```
1. User selects file
   ↓
2. handleFileSelect() triggered
   ↓
3. branchesApi.getGalleryUploadGrant(branchId)
   ├─ Request: POST /branches/{id}/gallery/signature
   └─ Response: PhotoUploadGrant {upload_url, public_id, signature, ...}
   ↓
4. uploadFileToCloudinary(grant, file)
   ├─ POST to grant.upload_url (Cloudinary)
   └─ Response: Image uploaded
   ↓
5. branchesApi.uploadGalleryImage() [internal call]
   ├─ Request: POST /branches/{id}/gallery {public_id}
   └─ Response: BranchGalleryImage
   ↓
6. loadGallery() - Auto-refresh
   ├─ Request: GET /branches/{id}/gallery
   └─ Response: Paginated<BranchGalleryImage>
   ↓
7. UI Updates with new image in grid
```

### Delete Image:
```
1. User clicks delete on image
   ↓
2. Confirmation dialog shows
   ↓
3. User confirms
   ↓
4. branchesApi.removeGalleryImage(branchId, imageId)
   ├─ Request: DELETE /branches/{id}/gallery/{imageId}
   └─ Response: Success
   ↓
5. loadGallery() - Auto-refresh
   ├─ Request: GET /branches/{id}/gallery
   └─ Response: Paginated<BranchGalleryImage>
   ↓
6. UI Updates with image removed
```

## UI Responsive Behavior

### Desktop (lg and up):
```
[Clinics List]  |  [Branches Table]
   (5 cols)     |      (7 cols)

Below:
[Gallery Panel (Full Width)]
```

### Tablet (md to lg):
```
[Clinics List]  |  [Branches Table]
   (5 cols)     |      (7 cols)

Below:
[Gallery Panel (Full Width)]
```

### Mobile (sm to md):
```
[Clinics List (Full Width)]

[Branches Table (Full Width)]

[Gallery Panel (Full Width)]
```

### Image Grid Responsive:
```
- sm: 2 columns
- md: 2 columns
- lg: 3 columns
- xl: 4 columns
```

## Error Handling

### Upload Errors:
```
If upload fails:
  ├─ Show error message
  ├─ Allow retry
  ├─ Reset upload state
  └─ Keep existing gallery visible
```

### Delete Errors:
```
If delete fails:
  ├─ Show error message
  ├─ Allow retry
  ├─ Reset delete state
  └─ Keep image visible
```

### Fetch Errors:
```
If gallery fetch fails:
  ├─ Show "Failed to load gallery"
  ├─ Display empty gallery
  ├─ Allow retry via re-select branch
  └─ Log error details
```

## Loading States

### Gallery Loading:
```
Loading Gallery:
  └─ Show spinner
  └─ Display "Loading gallery…"
  └─ Disable all buttons

Empty Gallery (0 images):
  └─ Show empty state icon
  └─ Display "No images yet"
  └─ Show hint: "Click 'Add image' to get started"
```

### Upload Loading:
```
During Upload:
  └─ Button text: "Uploading…"
  └─ Button disabled: true
  └─ File input hidden
```

### Delete Loading:
```
During Delete:
  └─ Button text: "Deleting…"
  └─ Button disabled: true
  └─ Other images still interactive
```

## Accessibility Features

- Semantic HTML elements
- ARIA labels for icon buttons
- Keyboard navigation support
- Confirmation dialogs for destructive actions
- Loading states clearly indicated
- Error messages descriptive
- Dark mode support
- Color contrast compliant

## Performance Considerations

1. **Image Loading:**
   - Lazy load gallery images
   - Use responsive image sizing
   - Optimize Cloudinary URLs

2. **State Management:**
   - Minimal re-renders via useCallback
   - Efficient state updates
   - No unnecessary API calls

3. **File Handling:**
   - Client-side file validation
   - Stream large files
   - Handle concurrent uploads

4. **Memory:**
   - Cleanup on unmount
   - Proper dependency management
   - Avoid memory leaks

## Testing Scenarios

```
✓ Upload single image
✓ Upload multiple images
✓ Delete image with confirmation
✓ View gallery grid
✓ Handle upload errors
✓ Handle delete errors
✓ Handle network errors
✓ Permission visibility
✓ Responsive design
✓ Dark mode
✓ Loading states
✓ Empty state
✓ Error state
```
