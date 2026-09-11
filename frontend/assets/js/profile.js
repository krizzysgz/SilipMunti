const GET_PROFILE_API = "/SilipMunti/backend/profile/get-profile.php";

const UPDATE_PROFILE_API = "/SilipMunti/backend/profile/update-profile.php";

const CHANGE_PASSWORD_API = "/SilipMunti/backend/profile/change-password.php";

const UPLOAD_PICTURE_API = "/SilipMunti/backend/profile/upload-picture.php";

const REMOVE_PICTURE_API = "/SilipMunti/backend/profile/remove-picture.php";

const DEFAULT_PROFILE_PICTURE = "../../assets/images/default-profile.svg";

const profileLoading = document.querySelector("#profile-loading");

const profileError = document.querySelector("#profile-error");

const profileErrorMessage = document.querySelector("#profile-error-message");

const retryProfileButton = document.querySelector("#retry-profile-button");

const profilePage = document.querySelector("#profile-page");

const profileForm = document.querySelector("#profile-form");

const firstNameInput = document.querySelector("#first-name");

const lastNameInput = document.querySelector("#last-name");

const emailInput = document.querySelector("#email");

const phoneNumberInput = document.querySelector("#phone-number");

const profileRole = document.querySelector("#profile-role");

const profileFullName = document.querySelector("#profile-full-name");

const profileEmailDisplay = document.querySelector("#profile-email-display");

const profilePicture = document.querySelector("#profile-picture");

const profilePictureInput = document.querySelector("#profile-picture-input");

const selectPictureButton = document.querySelector("#select-picture-button");

const removePictureButton = document.querySelector("#remove-picture-button");

const saveProfileButton = document.querySelector("#save-profile-button");

const profileFormMessage = document.querySelector("#profile-form-message");

const navbarProfilePicture = document.querySelector("#navbar-profile-picture");

const dropdownProfilePicture = document.querySelector(
  "#dropdown-profile-picture",
);

const dropdownUserName = document.querySelector("#dropdown-user-name");

const dropdownUserRole = document.querySelector("#dropdown-user-role");

const favoritesMenuLink = document.querySelector("#favorites-menu-link");

const profileMenuButton = document.querySelector("#profile-menu-button");

const profileDropdown = document.querySelector("#profile-dropdown");

const logoutButton = document.querySelector("#logout-button");

const mobileMenuButton = document.querySelector("#mobile-menu-button");

const mobileNavigation = document.querySelector("#mobile-navigation");

const passwordModal = document.querySelector("#password-modal");

const openPasswordModalButton = document.querySelector("#open-password-modal");

const closePasswordModalButton = document.querySelector(
  "#close-password-modal",
);

const passwordForm = document.querySelector("#password-form");

const currentPasswordInput = document.querySelector("#current-password");

const newPasswordInput = document.querySelector("#new-password");

const confirmPasswordInput = document.querySelector("#confirm-password");

const passwordFormMessage = document.querySelector("#password-form-message");

const savePasswordButton = document.querySelector("#save-password-button");

let currentUser = null;

function getProfilePictureUrl(path) {
  if (!path) {
    return DEFAULT_PROFILE_PICTURE;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("/")) {
    return path;
  }

  return `/SilipMunti/backend/${path}`;
}

function setImageSource(image, source) {
  if (!image) {
    return;
  }

  image.onerror = () => {
    image.onerror = null;
    image.src = DEFAULT_PROFILE_PICTURE;
  };

  image.src = source;
}

function setProfilePictures(path) {
  const pictureUrl = getProfilePictureUrl(path);

  setImageSource(profilePicture, pictureUrl);

  setImageSource(navbarProfilePicture, pictureUrl);

  setImageSource(dropdownProfilePicture, pictureUrl);

  removePictureButton.disabled = !path;
}

function updateDisplayedUser(user) {
  currentUser = user;

  const fullName = `${user.first_name} ${user.last_name}`;

  firstNameInput.value = user.first_name ?? "";

  lastNameInput.value = user.last_name ?? "";

  emailInput.value = user.email ?? "";

  phoneNumberInput.value = user.phone_number ?? "";

  profileFullName.textContent = fullName;

  profileEmailDisplay.textContent = user.email ?? "";

  profileRole.textContent = user.role ?? "User";

  dropdownUserName.textContent = fullName;

  dropdownUserRole.textContent = user.role ?? "User";

  if (favoritesMenuLink && user.role !== "renter") {
    favoritesMenuLink.classList.add("hidden");
  } else {
    favoritesMenuLink?.classList.remove("hidden");
  }

  setProfilePictures(user.profile_picture);
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });

  form.querySelectorAll(".invalid").forEach((input) => {
    input.classList.remove("invalid");
  });
}

function showFieldErrors(form, errors) {
  if (!errors) {
    return;
  }

  Object.entries(errors).forEach(([field, message]) => {
    const input = form.elements[field];

    const errorElement = form.querySelector(`[data-error-for="${field}"]`);

    input?.classList.add("invalid");

    if (errorElement) {
      errorElement.textContent = message;
    }
  });
}

function showFormMessage(element, message, type) {
  element.textContent = message;

  element.className = `form-message ${type}`;
}

function hideFormMessage(element) {
  element.textContent = "";

  element.className = "form-message hidden";
}

function showProfileError(message) {
  profileLoading.classList.add("hidden");

  profilePage.classList.add("hidden");

  profileErrorMessage.textContent = message;

  profileError.classList.remove("hidden");
}

function showProfilePage() {
  profileLoading.classList.add("hidden");

  profileError.classList.add("hidden");

  profilePage.classList.remove("hidden");
}

async function parseResponse(response) {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error("The server returned an invalid response.");
  }
}

async function loadProfile() {
  profileLoading.classList.remove("hidden");

  profileError.classList.add("hidden");

  profilePage.classList.add("hidden");

  try {
    const response = await fetch(GET_PROFILE_API, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      window.location.href = "../auth/login.html";

      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load profile.");
    }

    const user = result.data?.user ?? result.data?.profile ?? result.data;

    if (!user || typeof user !== "object") {
      throw new Error("Profile information is unavailable.");
    }

    updateDisplayedUser(user);

    showProfilePage();
  } catch (error) {
    console.error(error);

    showProfileError(error.message || "Unable to load profile.");
  }
}

async function updateProfile(event) {
  event.preventDefault();

  clearFieldErrors(profileForm);

  hideFormMessage(profileFormMessage);

  const profileData = {
    first_name: firstNameInput.value.trim(),

    last_name: lastNameInput.value.trim(),

    phone_number: phoneNumberInput.value.trim(),
  };

  if (profileData.first_name === "") {
    showFieldErrors(profileForm, {
      first_name: "First name is required.",
    });

    return;
  }

  if (profileData.last_name === "") {
    showFieldErrors(profileForm, {
      last_name: "Last name is required.",
    });

    return;
  }

  saveProfileButton.disabled = true;

  const buttonText = saveProfileButton.querySelector("span");

  buttonText.textContent = "Saving...";

  try {
    const response = await window.SilipMuntiSession.secureFetch(
      UPDATE_PROFILE_API,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(profileData),
      },
    );

    const result = await parseResponse(response);

    if (!response.ok || !result.success) {
      showFieldErrors(profileForm, result.errors);

      throw new Error(result.message || "Unable to update profile.");
    }

    const updatedUser = result.data?.user ?? {
      ...currentUser,
      ...profileData,
    };

    updateDisplayedUser(updatedUser);

    showFormMessage(
      profileFormMessage,
      result.message || "Profile updated successfully.",
      "success",
    );
  } catch (error) {
    showFormMessage(
      profileFormMessage,
      error.message || "Unable to update profile.",
      "error",
    );
  } finally {
    saveProfileButton.disabled = false;

    buttonText.textContent = "Save Changes";
  }
}

function validatePicture(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG and WebP images are allowed.");
  }

  const maximumSize = 2 * 1024 * 1024;

  if (file.size > maximumSize) {
    throw new Error("Profile picture must not exceed 2 MB.");
  }
}

async function uploadProfilePicture() {
  const file = profilePictureInput.files[0];

  if (!file) {
    return;
  }

  hideFormMessage(profileFormMessage);

  try {
    validatePicture(file);
  } catch (error) {
    showFormMessage(profileFormMessage, error.message, "error");

    profilePictureInput.value = "";

    return;
  }

  const formData = new FormData();

  formData.append("profile_picture", file);

  selectPictureButton.disabled = true;

  selectPictureButton.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
    Uploading...
  `;

  try {
    const response = await window.SilipMuntiSession.secureFetch(
      UPLOAD_PICTURE_API,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      },
    );

    const result = await parseResponse(response);

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to upload picture.");
    }

    const picturePath =
      result.data?.profile_picture ?? result.data?.profile_picture_url;

    currentUser.profile_picture = picturePath;

    setProfilePictures(picturePath);

    showFormMessage(
      profileFormMessage,
      result.message || "Profile picture uploaded successfully.",
      "success",
    );
  } catch (error) {
    showFormMessage(
      profileFormMessage,
      error.message || "Unable to upload picture.",
      "error",
    );
  } finally {
    profilePictureInput.value = "";

    selectPictureButton.disabled = false;

    selectPictureButton.innerHTML = `
      <i class="fa-solid fa-camera"></i>
      Upload Picture
    `;
  }
}

async function removeProfilePicture() {
  const confirmed = await window.SilipModal.confirm({
    title: "Remove profile picture?",
    message: "Your account will use the default profile image.",
    confirmText: "Remove picture",
  });

  if (!confirmed) {
    return;
  }

  hideFormMessage(profileFormMessage);

  removePictureButton.disabled = true;

  removePictureButton.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
    Removing...
  `;

  try {
    const response = await window.SilipMuntiSession.secureFetch(
      REMOVE_PICTURE_API,
      {
        method: "DELETE",
        credentials: "include",
      },
    );

    const result = await parseResponse(response);

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to remove picture.");
    }

    currentUser.profile_picture = null;

    setProfilePictures(null);

    showFormMessage(
      profileFormMessage,
      result.message || "Profile picture removed successfully.",
      "success",
    );
  } catch (error) {
    showFormMessage(
      profileFormMessage,
      error.message || "Unable to remove picture.",
      "error",
    );
  } finally {
    removePictureButton.disabled = !currentUser?.profile_picture;

    removePictureButton.innerHTML = `
      <i class="fa-regular fa-trash-can"></i>
      Remove Picture
    `;
  }
}

function openPasswordModal() {
  passwordForm.reset();

  clearFieldErrors(passwordForm);

  hideFormMessage(passwordFormMessage);

  passwordModal.classList.remove("hidden");

  document.body.classList.add("modal-open");

  setTimeout(() => {
    currentPasswordInput.focus();
  }, 100);
}

function closePasswordModal() {
  passwordModal.classList.add("hidden");

  document.body.classList.remove("modal-open");

  passwordForm.reset();

  clearFieldErrors(passwordForm);

  hideFormMessage(passwordFormMessage);
}

async function changePassword(event) {
  event.preventDefault();

  clearFieldErrors(passwordForm);

  hideFormMessage(passwordFormMessage);

  const passwordData = {
    current_password: currentPasswordInput.value,

    new_password: newPasswordInput.value,

    confirm_password: confirmPasswordInput.value,
  };

  const errors = {};

  if (passwordData.current_password === "") {
    errors.current_password = "Current password is required.";
  }

  if (passwordData.new_password === "") {
    errors.new_password = "New password is required.";
  } else if (passwordData.new_password.length < 8) {
    errors.new_password = "New password must contain at least 8 characters.";
  }

  if (passwordData.confirm_password === "") {
    errors.confirm_password = "Password confirmation is required.";
  } else if (passwordData.new_password !== passwordData.confirm_password) {
    errors.confirm_password = "Passwords do not match.";
  }

  if (Object.keys(errors).length > 0) {
    showFieldErrors(passwordForm, errors);

    return;
  }

  savePasswordButton.disabled = true;

  const buttonText = savePasswordButton.querySelector("span");

  buttonText.textContent = "Updating...";

  try {
    const response = await window.SilipMuntiSession.secureFetch(
      CHANGE_PASSWORD_API,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(passwordData),
      },
    );

    const result = await parseResponse(response);

    if (!response.ok || !result.success) {
      showFieldErrors(passwordForm, result.errors);

      throw new Error(result.message || "Unable to change password.");
    }

    passwordForm.reset();

    showFormMessage(
      passwordFormMessage,
      result.message || "Password changed successfully.",
      "success",
    );

    setTimeout(() => {
      closePasswordModal();
    }, 1300);
  } catch (error) {
    showFormMessage(
      passwordFormMessage,
      error.message || "Unable to change password.",
      "error",
    );
  } finally {
    savePasswordButton.disabled = false;

    buttonText.textContent = "Update Password";
  }
}

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const inputId = button.dataset.togglePassword;

    const input = document.getElementById(inputId);

    if (!input) {
      return;
    }

    const willShow = input.type === "password";

    input.type = willShow ? "text" : "password";

    button.innerHTML = willShow
      ? '<i class="fa-solid fa-eye-slash"></i>'
      : '<i class="fa-solid fa-eye"></i>';

    button.setAttribute(
      "aria-label",
      willShow ? "Hide password" : "Show password",
    );
  });
});

profileMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();

  const isHidden = profileDropdown.classList.toggle("hidden");

  profileMenuButton.setAttribute("aria-expanded", String(!isHidden));
});

profileDropdown.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", () => {
  profileDropdown.classList.add("hidden");

  profileMenuButton.setAttribute("aria-expanded", "false");
});

mobileMenuButton.addEventListener("click", () => {
  const isHidden = mobileNavigation.classList.toggle("hidden");

  mobileMenuButton.setAttribute("aria-expanded", String(!isHidden));

  mobileMenuButton.innerHTML = isHidden
    ? '<i class="fa-solid fa-bars"></i>'
    : '<i class="fa-solid fa-xmark"></i>';
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await SilipMuntiSession.logoutUser();
  } finally {
    logoutButton.disabled = false;
  }
});

retryProfileButton.addEventListener("click", loadProfile);

profileForm.addEventListener("submit", updateProfile);

selectPictureButton.addEventListener("click", () => {
  profilePictureInput.click();
});

profilePictureInput.addEventListener("change", uploadProfilePicture);

removePictureButton.addEventListener("click", removeProfilePicture);

openPasswordModalButton.addEventListener("click", openPasswordModal);

closePasswordModalButton.addEventListener("click", closePasswordModal);

passwordModal.addEventListener("click", (event) => {
  if (event.target === passwordModal) {
    closePasswordModal();
  }
});

passwordForm.addEventListener("submit", changePassword);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !passwordModal.classList.contains("hidden")) {
    closePasswordModal();
  }
});

loadProfile();
