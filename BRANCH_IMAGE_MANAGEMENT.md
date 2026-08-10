# Branch Image Management Implementation

## Overview
Added comprehensive branch image management functionality including:
- **Branch photo** - Single profile photo per branch
- **Branch gallery** - Multiple images per branch for portfolio/showcase
- Permission-based access control for uploads and deletions

## Files Added

### 1. **BranchGalleryPanel.tsx** (New Component)
`src/components/branches/BranchGalleryPanel.tsx`

A complete image gallery management component for branches with:
- **Features:**
  - Upload multiple images to branch gallery
  - Grid display of uploaded images
  - Delete individual gallery images
  - Image metadata (upload date)
  - Loading and error states
  - Permission-based button visibility

- **Props:**
  - `branchId: string` - Branch ID
  - `branchName: string` - Branch name for display

- **Permissions:**
  - `canUpdateBranch` - Required to upload images
  - `canDeleteBranch` - Required to delete images
  - Admins always have full access

## API Integration Updates

### 2. **api.ts** (Updated)
`src/lib/api.ts`

#### New Types Added:
```typescript
interface BranchGalleryImage {
  id: string;
  branch_id: string;
  image_url: string;
  public_id: string;
  uploaded_by: string;
  created_at: string;
}
```

#### New API Methods Added to `branchesApi`:
- `getGalleryUploadGrant(id)` - Get Cloudinary signature for gallery upload
- `uploadGalleryImage(id, file)` - Upload image to gallery
- `listGallery(id)` - Fetch all gallery images for a branch
- `removeGalleryImage(branchId, imageId)` - Delete gallery image

**API Endpoints:**
```
POST   /branches/{id}/gallery/signature      - Get upload signature
POST   /branches/{id}/gallery                - Add image to gallery
GET    /branches/{id}/gallery                - List all gallery images
DELETE /branches/{id}/gallery/{imageId}      - Delete gallery image
```

### Existing Photo Upload:
The branch photo upload functionality already existed:
- `getPhotoUploadGrant(id)` - GET upload signature
- `uploadPhoto(id, file)` - Upload profile photo

## Component Updates

### 3. **ClinicsPanel.tsx** (Updated)
`src/components/clinics/ClinicsPanel.tsx`

**Changes:**
- Added `BranchGalleryPanel` import
- Added `selectedBranch` state to track selected branch
- Modified branch table rows to be clickable (click to select branch)
- Added gallery panel display below branches when a branch is selected
- Permission checks integrated for all operations

**Features:**
- Click on branch name in table to view/manage its gallery
- Gallery panel appears below the branches table
- Upload, view, and delete gallery images per branch

## Feature Workflow

### For Users with Upload Permission:

1. **Navigate to Clinics Page**
   - View all clinics and their branches

2. **Select a Branch**
   - Click on a branch name in the table
   - Gallery panel appears below

3. **Upload Images**
   - Click "+ Add image" button
   - Select image from device
   - Image uploads to Cloudinary via signed URL
   - Gallery refreshes automatically

4. **View Gallery**
   - Grid display of all uploaded images
   - Shows upload date
   - Hover to show delete button (if permission granted)

5. **Delete Images**
   - Hover over image
   - Click "Delete" button
   - Confirm deletion
   - Gallery refreshes

### For Users without Upload Permission:

- Gallery panel is hidden or disabled
- "Add image" button is hidden
- Cannot upload or delete images
- Can still view images if public

## Permission Model

### Required Permissions:
- `branch:update` - Upload images to gallery
- `branch:delete` - Delete gallery images
- `clinics:manage` - Access branch management section

### Role-Based Access:
- **Clinic Owner & Sys Admin**: Full access (no permission checks)
- **Branch Staff**: Access based on assigned permissions

## Image Upload Process

1. **Get Upload Grant**
   ```
   POST /branches/{id}/gallery/signature
   ```
   Returns: `PhotoUploadGrant` with Cloudinary credentials

2. **Upload to Cloudinary**
   - Uses signed URL approach
   - Validates file type and size
   - Returns public_id

3. **Register with Backend**
   ```
   POST /branches/{id}/gallery
   Body: { public_id: string }
   ```
   Returns: `BranchGalleryImage`

## UI/UX Features

### Gallery Panel
- **Responsive Grid**: Adapts to screen size (1-4 columns)
- **Empty State**: Shows friendly message when no images
- **Loading State**: Displays while fetching gallery
- **Error Handling**: Shows error messages with retry capability
- **Dark Mode Support**: Full Tailwind CSS dark mode support

### Upload Experience
- **File Input**: Accept image/* file types
- **Upload Feedback**: Disabled button shows "Uploading…"
- **Auto Refresh**: Gallery automatically refreshes after upload
- **Error Notifications**: Clear error messages if upload fails

### Delete Experience
- **Confirmation Dialog**: Asks "Delete this image?" before deleting
- **Loading State**: Button shows "Deleting…" during deletion
- **Hover Effect**: Delete button appears on image hover
- **Smooth Removal**: Gallery refreshes after deletion

## Build Status
✅ **Successfully Compiled** - No TypeScript errors

## Testing Checklist

- [ ] Upload single image to branch gallery
- [ ] Upload multiple images to same branch
- [ ] View gallery images in responsive grid
- [ ] Delete gallery image with confirmation
- [ ] Verify permission checks work correctly
- [ ] Test with different user roles
- [ ] Test error scenarios (upload fail, network error)
- [ ] Verify permission denials hide buttons appropriately
- [ ] Test on mobile, tablet, and desktop screens

## Next Steps

1. **Backend Implementation**: Ensure API endpoints are implemented
2. **Cloudinary Setup**: Configure Cloudinary credentials in backend
3. **Testing**: Test upload and deletion workflows
4. **Performance**: Optimize image loading (lazy loading, progressive display)
5. **Enhancement Ideas**:
   - Image reordering/sorting
   - Batch upload
   - Image cropping/editing
   - Image sets/albums
   - Public gallery view

## Notes

- Images are uploaded to Cloudinary using signed URLs for security
- Gallery images are associated with specific branches
- Upload history is tracked (uploaded_by field)
- All operations respect role-based permissions
- Component handles loading, error, and success states gracefully
