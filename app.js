// NANA ACADEMY - Main Application JavaScript
// This file handles authentication, user management, and admin functions

// ============================================
// GLOBAL VARIABLES AND STATE
// ============================================

let currentUser = null;
let userRole = null;
let adminStats = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Show message to user
function showMessage(message, type = 'info', duration = 5000) {
    const messageContainer = document.getElementById('messageContainer');
    
    if (!messageContainer) {
        console.log(`${type.toUpperCase()}: ${message}`);
        return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} show`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    messageDiv.innerHTML = `
        <i class="fas fa-${icon}"></i>
        ${message}
    `;
    
    messageContainer.innerHTML = '';
    messageContainer.appendChild(messageDiv);
    
    // Auto-hide non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            messageDiv.classList.remove('show');
            setTimeout(() => {
                if (messageDiv.parentNode === messageContainer) {
                    messageContainer.removeChild(messageDiv);
                }
            }, 500);
        }, duration);
    }
}

// Get user role from Firestore
async function getUserRole(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            return userDoc.data().role;
        }
        return null;
    } catch (error) {
        console.error("Error getting user role:", error);
        return null;
    }
}

// Save user role to Firestore
async function saveUserRole(uid, email, name, role, additionalData = {}) {
    try {
        const userData = {
            email: email,
            name: name,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add any additional data
        Object.assign(userData, additionalData);
        
        await db.collection('users').doc(uid).set(userData);
        return true;
    } catch (error) {
        console.error("Error saving user role:", error);
        return false;
    }
}

// Update user login timestamp
async function updateUserLoginTime(uid) {
    try {
        await db.collection('users').doc(uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error updating login time:", error);
    }
}

// Check if user has required role
function hasRole(requiredRole) {
    if (!currentUser || !userRole) return false;
    return userRole === requiredRole;
}

// Check if user is admin
function isAdmin() {
    return hasRole('admin');
}

// Generate random password
function generatePassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// ============================================
// ADMIN DATABASE FUNCTIONS
// ============================================

// Get admin dashboard statistics
async function getAdminStats() {
    try {
        // Get counts from all collections
        const [studentsCount, teachersCount, classesCount, announcementsCount] = await Promise.all([
            db.collection('students').get().then(snapshot => snapshot.size),
            db.collection('teachers').get().then(snapshot => snapshot.size),
            db.collection('classes').get().then(snapshot => snapshot.size),
            db.collection('announcements').get().then(snapshot => snapshot.size)
        ]);
        
        return {
            students: studentsCount,
            teachers: teachersCount,
            classes: classesCount,
            announcements: announcementsCount,
            lastUpdated: new Date().toLocaleString()
        };
    } catch (error) {
        console.error("Error getting admin stats:", error);
        return null;
    }
}

// Add a new student to database (WITH LOGIN)
async function addStudent(studentData) {
    try {
        // Validate required fields
        if (!studentData.firstName || !studentData.lastName || !studentData.studentEmail) {
            return { success: false, error: 'Missing required fields' };
        }
        
        // Generate student ID
        const studentId = 'STU' + Date.now().toString().slice(-6);
        
        let userCredential = null;
        let generatedPassword = null;
        
        // Create Firebase Authentication account for student if requested
        if (studentData.createLogin) {
            // Generate password if not provided
            const password = studentData.password || generatePassword();
            generatedPassword = password;
            
            try {
                // Create user in Firebase Authentication
                userCredential = await auth.createUserWithEmailAndPassword(
                    studentData.studentEmail, 
                    password
                );
                
                // Send email verification
                await userCredential.user.sendEmailVerification();
                
                // If password was generated, send password reset email
                if (!studentData.password) {
                    await auth.sendPasswordResetEmail(studentData.studentEmail);
                }
                
                // Save user role to Firestore
                await saveUserRole(
                    userCredential.user.uid,
                    studentData.studentEmail,
                    `${studentData.firstName} ${studentData.lastName}`,
                    'student',
                    { studentId: studentId }
                );
                
            } catch (authError) {
                console.error("Authentication error:", authError);
                // Continue with student creation even if auth fails
                // This allows admin to create student record without login
            }
        }
        
        // Add student to database
        await db.collection('students').doc(studentId).set({
            studentId: studentId,
            firstName: studentData.firstName,
            lastName: studentData.lastName,
            fullName: `${studentData.firstName} ${studentData.lastName}`,
            gender: studentData.gender,
            dateOfBirth: studentData.dateOfBirth,
            currentClass: studentData.currentClass,
            parentName: studentData.parentName,
            parentPhone: studentData.parentPhone,
            parentEmail: studentData.parentEmail,
            studentEmail: studentData.studentEmail,
            homeAddress: studentData.homeAddress,
            photoURL: '',
            dateEnrolled: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true,
            hasLoginAccount: studentData.createLogin || false,
            createdBy: currentUser ? currentUser.uid : 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { 
            success: true, 
            studentId: studentId,
            generatedPassword: generatedPassword,
            hasLogin: studentData.createLogin || false
        };
        
    } catch (error) {
        console.error("Error adding student:", error);
        return { success: false, error: error.message };
    }
}

// Add a new teacher to database (WITH LOGIN)
async function addTeacher(teacherData) {
    try {
        // Validate required fields
        if (!teacherData.name || !teacherData.email) {
            return { success: false, error: 'Missing required fields' };
        }
        
        // Generate teacher ID
        const teacherId = 'TCH' + Date.now().toString().slice(-6);
        
        let userCredential = null;
        let generatedPassword = null;
        
        // Create Firebase Authentication account for teacher
        if (teacherData.createLogin) {
            // Generate password if not provided
            const password = teacherData.password || generatePassword();
            generatedPassword = password;
            
            try {
                // Create user in Firebase Authentication
                userCredential = await auth.createUserWithEmailAndPassword(
                    teacherData.email, 
                    password
                );
                
                // Send email verification
                await userCredential.user.sendEmailVerification();
                
                // If password was generated, send password reset email
                if (!teacherData.password) {
                    await auth.sendPasswordResetEmail(teacherData.email);
                }
                
                // Save user role to Firestore
                await saveUserRole(
                    userCredential.user.uid,
                    teacherData.email,
                    teacherData.name,
                    'teacher',
                    { teacherId: teacherId }
                );
                
            } catch (authError) {
                console.error("Authentication error:", authError);
                return { success: false, error: `Failed to create login: ${authError.message}` };
            }
        }
        
        // Add teacher to database
        await db.collection('teachers').doc(teacherId).set({
            teacherId: teacherId,
            name: teacherData.name,
            subjects: teacherData.subjects || [],
            phone: teacherData.phone,
            email: teacherData.email,
            assignedClasses: teacherData.assignedClasses || [],
            role: 'teacher',
            dateJoined: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true,
            hasLoginAccount: teacherData.createLogin || false,
            createdBy: currentUser ? currentUser.uid : 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { 
            success: true, 
            teacherId: teacherId,
            generatedPassword: generatedPassword,
            hasLogin: teacherData.createLogin || false
        };
        
    } catch (error) {
        console.error("Error adding teacher:", error);
        return { success: false, error: error.message };
    }
}

// Get all students
async function getAllStudents() {
    try {
        const snapshot = await db.collection('students')
            .orderBy('dateEnrolled', 'desc')
            .limit(50)
            .get();
            
        const students = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Handle both old and new data structures
            if (data.isActive === undefined || data.isActive === true) {
                students.push({ id: doc.id, ...data });
            }
        });
        return students;
    } catch (error) {
        console.error("Error getting students:", error);
        return [];
    }
}

// Get all teachers
async function getAllTeachers() {
    try {
        const snapshot = await db.collection('teachers')
            .orderBy('dateJoined', 'desc')
            .limit(50)
            .get();
            
        const teachers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Handle both old and new data structures
            if (data.isActive === undefined || data.isActive === true) {
                teachers.push({ id: doc.id, ...data });
            }
        });
        return teachers;
    } catch (error) {
        console.error("Error getting teachers:", error);
        return [];
    }
}

// Add a new class
async function addClass(classData) {
    try {
        const classId = 'CLS' + Date.now().toString().slice(-6);
        
        await db.collection('classes').doc(classId).set({
            classId: classId,
            className: classData.className,
            level: classData.level,
            teacherId: classData.teacherId,
            academicYear: classData.academicYear,
            studentIds: [],
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, classId: classId };
    } catch (error) {
        console.error("Error adding class:", error);
        return { success: false, error: error.message };
    }
}

// Get all classes
async function getAllClasses() {
    try {
        const snapshot = await db.collection('classes').orderBy('className').get();
        const classes = [];
        snapshot.forEach(doc => {
            classes.push({ id: doc.id, ...doc.data() });
        });
        return classes;
    } catch (error) {
        console.error("Error getting classes:", error);
        return [];
    }
}

// Add a new announcement
async function addAnnouncement(announcementData) {
    try {
        const announcementId = 'ANN' + Date.now().toString().slice(-6);
        
        await db.collection('announcements').doc(announcementId).set({
            announcementId: announcementId,
            title: announcementData.title,
            content: announcementData.content,
            authorId: currentUser.uid,
            authorName: currentUser.email,
            targetRoles: announcementData.targetRoles || ['all'],
            isActive: true,
            datePosted: firebase.firestore.FieldValue.serverTimestamp(),
            expiryDate: announcementData.expiryDate || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, announcementId: announcementId };
    } catch (error) {
        console.error("Error adding announcement:", error);
        return { success: false, error: error.message };
    }
}

// Get all announcements
async function getAllAnnouncements() {
    try {
        const snapshot = await db.collection('announcements')
            .orderBy('datePosted', 'desc')
            .limit(50)
            .get();
        
        const announcements = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Handle both old and new data structures
            if (data.isActive === undefined || data.isActive === true) {
                announcements.push({ id: doc.id, ...data });
            }
        });
        return announcements;
    } catch (error) {
        console.error("Error getting announcements:", error);
        return [];
    }
}

// Update student information
async function updateStudent(studentId, updateData) {
    try {
        await db.collection('students').doc(studentId).update({
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating student:", error);
        return { success: false, error: error.message };
    }
}

// Update teacher information
async function updateTeacher(teacherId, updateData) {
    try {
        await db.collection('teachers').doc(teacherId).update({
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating teacher:", error);
        return { success: false, error: error.message };
    }
}

// Delete student (soft delete - mark as inactive)
async function deleteStudent(studentId) {
    try {
        await db.collection('students').doc(studentId).update({
            isActive: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error deleting student:", error);
        return { success: false, error: error.message };
    }
}

// Delete teacher (soft delete - mark as inactive)
async function deleteTeacher(teacherId) {
    try {
        await db.collection('teachers').doc(teacherId).update({
            isActive: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error deleting teacher:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

// Handle user login
async function handleLogin(email, password, role) {
    try {
        // Show loading state
        const submitBtn = document.getElementById('loginSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
            submitBtn.disabled = true;
        }
        
        // Sign in with Firebase Authentication
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Check if email is verified (optional)
        if (!user.emailVerified) {
            showMessage('Please verify your email address before logging in.', 'warning');
            // You can choose to allow login without verification
            // await auth.signOut();
            // return;
        }
        
        // Get user role from Firestore
        const userRoleFromDB = await getUserRole(user.uid);
        
        if (!userRoleFromDB) {
            // If no role found, this is likely a new user
            showMessage('User account not properly set up. Please contact administrator.', 'error');
            await auth.signOut();
            
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                submitBtn.disabled = false;
            }
            return;
        }
        
        // Check if the selected role matches the stored role
        if (userRoleFromDB !== role) {
            showMessage(`Please login as ${userRoleFromDB}. Selected role does not match.`, 'error');
            await auth.signOut();
            
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                submitBtn.disabled = false;
            }
            return;
        }
        
        // Update login time
        await updateUserLoginTime(user.uid);
        
        // Set global variables
        currentUser = user;
        userRole = userRoleFromDB;
        
        showMessage(`Welcome back! Logged in as ${userRoleFromDB}.`, 'success');
        
        // Reset button
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            submitBtn.disabled = false;
        }
        
        // Redirect based on role after a short delay
        setTimeout(() => {
            redirectBasedOnRole(userRoleFromDB);
        }, 1500);
        
    } catch (error) {
        // Handle errors
        let errorMessage = 'Login failed. ';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address.';
                break;
            case 'auth/user-disabled':
                errorMessage += 'This account has been disabled.';
                break;
            case 'auth/user-not-found':
                errorMessage += 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage += 'Incorrect password.';
                break;
            case 'auth/too-many-requests':
                errorMessage += 'Too many failed attempts. Try again later.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showMessage(errorMessage, 'error');
        
        // Reset button
        const submitBtn = document.getElementById('loginSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            submitBtn.disabled = false;
        }
    }
}

// Handle password reset
async function handlePasswordReset(email, role) {
    try {
        // Show loading state
        const submitBtn = document.getElementById('resetSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending Reset Link...';
            submitBtn.disabled = true;
        }
        
        // Send password reset email
        await auth.sendPasswordResetEmail(email);
        
        showMessage('Password reset email sent! Please check your inbox.', 'success');
        
        // Reset button
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
            submitBtn.disabled = false;
        }
        
        // Clear form
        document.getElementById('resetForm').reset();
        
        // Switch to login tab after delay
        setTimeout(() => {
            switchTab('login');
        }, 3000);
        
    } catch (error) {
        // Handle errors
        let errorMessage = 'Password reset failed. ';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address.';
                break;
            case 'auth/user-not-found':
                errorMessage += 'No account found with this email.';
                break;
            case 'auth/too-many-requests':
                errorMessage += 'Too many attempts. Try again later.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showMessage(errorMessage, 'error');
        
        // Reset button
        const submitBtn = document.getElementById('resetSubmit');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
            submitBtn.disabled = false;
        }
    }
}

// Handle user logout
async function handleLogout() {
    try {
        await auth.signOut();
        currentUser = null;
        userRole = null;
        adminStats = null;
        showMessage('Logged out successfully.', 'success');
        
        // Redirect to login page after a short delay
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
        
    } catch (error) {
        console.error("Logout error:", error);
        showMessage('Logout failed. Please try again.', 'error');
    }
}

// Check authentication state
function checkAuthState() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            
            // Get user role from Firestore
            userRole = await getUserRole(user.uid);
            
            // Update UI for logged-in users
            updateUIForLoggedInUser(user.email, userRole);
            
            console.log(`User logged in: ${user.email}, Role: ${userRole}`);
            
            // If on admin dashboard, load admin data
            if (window.location.pathname.includes('admin-dashboard.html') && userRole === 'admin') {
                loadAdminDashboard();
            }
            
            // If on login page but already logged in, redirect to appropriate dashboard
            if (window.location.pathname.includes('login.html') && userRole) {
                redirectBasedOnRole(userRole);
            }
            
        } else {
            currentUser = null;
            userRole = null;
            adminStats = null;
            
            // Update UI for logged-out users
            updateUIForLoggedOutUser();
            
            console.log("User logged out");
            
            // Redirect to login if on admin dashboard without authentication
            if (window.location.pathname.includes('admin-dashboard.html')) {
                showMessage('Please login to access admin dashboard', 'warning');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            }
        }
    });
}

// ============================================
// ADMIN DASHBOARD FUNCTIONS
// ============================================

// Load admin dashboard data
async function loadAdminDashboard() {
    console.log("Loading admin dashboard...");
    
    try {
        // Check if user is admin
        if (!isAdmin()) {
            showMessage('Access denied. Admin privileges required.', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        
        // Update admin info
        updateAdminInfo();
        
        // Load statistics
        adminStats = await getAdminStats();
        if (adminStats) {
            updateDashboardStats(adminStats);
        }
        
        // Load recent students
        const students = await getAllStudents();
        if (students.length > 0) {
            updateRecentStudents(students.slice(0, 10));
        } else {
            // Show no data message
            const container = document.getElementById('recentStudents');
            if (container) {
                container.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                            <i class="fas fa-users-slash"></i> No students found
                        </td>
                    </tr>
                `;
            }
        }
        
        // Load recent teachers
        const teachers = await getAllTeachers();
        if (teachers.length > 0) {
            updateRecentTeachers(teachers.slice(0, 10));
        } else {
            // Show no data message
            const container = document.getElementById('recentTeachers');
            if (container) {
                container.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                            <i class="fas fa-chalkboard-teacher"></i> No teachers found
                        </td>
                    </tr>
                `;
            }
        }
        
        // Load announcements
        const announcements = await getAllAnnouncements();
        if (announcements.length > 0) {
            updateRecentAnnouncements(announcements.slice(0, 5));
        } else {
            // Show no data message
            const container = document.getElementById('recentAnnouncements');
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--gray);">
                        <i class="fas fa-bullhorn"></i> No announcements found
                    </div>
                `;
            }
        }
        
        console.log("Admin dashboard loaded successfully");
        
    } catch (error) {
        console.error("Error loading admin dashboard:", error);
        showMessage('Error loading dashboard data. Please refresh the page.', 'error');
    }
}

// Update dashboard statistics display
function updateDashboardStats(stats) {
    const statsContainer = document.getElementById('dashboardStats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background-color: #4CAF50;">
                <i class="fas fa-users"></i>
            </div>
            <div class="stat-info">
                <h3>${stats.students}</h3>
                <p>Total Students</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background-color: #2196F3;">
                <i class="fas fa-chalkboard-teacher"></i>
            </div>
            <div class="stat-info">
                <h3>${stats.teachers}</h3>
                <p>Total Teachers</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background-color: #FF9800;">
                <i class="fas fa-door-open"></i>
            </div>
            <div class="stat-info">
                <h3>${stats.classes}</h3>
                <p>Active Classes</p>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background-color: #9C27B0;">
                <i class="fas fa-bullhorn"></i>
            </div>
            <div class="stat-info">
                <h3>${stats.announcements}</h3>
                <p>Announcements</p>
            </div>
        </div>
    `;
}

// Update recent students list
function updateRecentStudents(students) {
    const container = document.getElementById('recentStudents');
    if (!container) return;
    
    let html = '';
    students.forEach((student, index) => {
        const date = student.dateEnrolled ? new Date(student.dateEnrolled.seconds * 1000).toLocaleDateString() : 'N/A';
        const hasLogin = student.hasLoginAccount ? 'Yes' : (student.studentEmail ? 'Yes' : 'No');
        const email = student.studentEmail || student.email || 'No email';
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${student.fullName || `${student.firstName} ${student.lastName}`}</td>
                <td>${student.currentClass || 'Not assigned'}</td>
                <td>${email}</td>
                <td>${date}</td>
                <td>
                    <button class="btn-action view-student" data-id="${student.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action edit-student" data-id="${student.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    container.innerHTML = html;
}

// Update recent teachers list
function updateRecentTeachers(teachers) {
    const container = document.getElementById('recentTeachers');
    if (!container) return;
    
    let html = '';
    teachers.forEach((teacher, index) => {
        const date = teacher.dateJoined ? new Date(teacher.dateJoined.seconds * 1000).toLocaleDateString() : 'N/A';
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${teacher.name}</td>
                <td>${teacher.subjects ? teacher.subjects.join(', ') : 'N/A'}</td>
                <td>${teacher.email}</td>
                <td>${date}</td>
                <td>
                    <button class="btn-action view-teacher" data-id="${teacher.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action edit-teacher" data-id="${teacher.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    container.innerHTML = html;
}

// Update recent announcements list
function updateRecentAnnouncements(announcements) {
    const container = document.getElementById('recentAnnouncements');
    if (!container) return;
    
    let html = '';
    announcements.forEach((announcement, index) => {
        const date = announcement.datePosted ? new Date(announcement.datePosted.seconds * 1000).toLocaleDateString() : 'N/A';
        html += `
            <div class="announcement-item">
                <div class="announcement-header">
                    <h4>${announcement.title}</h4>
                    <span class="announcement-date">${date}</span>
                </div>
                <p>${announcement.content.substring(0, 100)}${announcement.content.length > 100 ? '...' : ''}</p>
                <div class="announcement-footer">
                    <span class="announcement-author">By: ${announcement.authorName || 'Admin'}</span>
                    <button class="btn-action edit-announcement" data-id="${announcement.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Update admin info in dashboard
function updateAdminInfo() {
    if (currentUser) {
        const adminName = document.getElementById('adminName');
        const adminEmail = document.getElementById('adminEmail');
        
        if (adminName) {
            adminName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
        }
        if (adminEmail) {
            adminEmail.textContent = currentUser.email;
        }
    }
}

// ============================================
// UI FUNCTIONS
// ============================================

// Update UI for logged-in user
function updateUIForLoggedInUser(email, role) {
    // Update navigation
    const navLoginBtn = document.querySelector('.nav-menu .login-btn');
    if (navLoginBtn) {
        navLoginBtn.innerHTML = `<i class="fas fa-user"></i> ${role}`;
        navLoginBtn.href = '#';
        navLoginBtn.onclick = (e) => {
            e.preventDefault();
            showUserMenu();
        };
    }
    
    // Add user menu if it doesn't exist
    if (!document.getElementById('userMenu') && document.querySelector('.nav-menu .login-btn')) {
        const userMenu = document.createElement('div');
        userMenu.id = 'userMenu';
        userMenu.className = 'user-menu';
        userMenu.style.cssText = `
            position: absolute;
            top: 70px;
            right: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.15);
            padding: 15px;
            min-width: 200px;
            display: none;
            z-index: 1000;
        `;
        
        userMenu.innerHTML = `
            <div style="padding: 10px 0; border-bottom: 1px solid #eee;">
                <strong>${email}</strong>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">Role: ${role}</div>
            </div>
            <div style="padding: 10px 0;">
                ${role === 'admin' ? '<a href="admin-dashboard.html" id="dashboardLink" style="display: block; padding: 8px 0; color: #333; text-decoration: none;"><i class="fas fa-tachometer-alt"></i> Dashboard</a>' : ''}
                <a href="#" id="profileLink" style="display: block; padding: 8px 0; color: #333; text-decoration: none;">
                    <i class="fas fa-user-circle"></i> My Profile
                </a>
                <a href="#" id="logoutLink" style="display: block; padding: 8px 0; color: #dc3545; text-decoration: none;">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </a>
            </div>
        `;
        
        document.body.appendChild(userMenu);
        
        // Add event listeners
        document.getElementById('logoutLink').addEventListener('click', handleLogout);
        
        const dashboardLink = document.getElementById('dashboardLink');
        if (dashboardLink) {
            dashboardLink.addEventListener('click', (e) => {
                e.preventDefault();
                redirectBasedOnRole(role);
            });
        }
    }
}

// Show user menu
function showUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        userMenu.style.display = userMenu.style.display === 'block' ? 'none' : 'block';
        
        // Close menu when clicking outside
        setTimeout(() => {
            const closeMenu = (e) => {
                if (userMenu && !userMenu.contains(e.target) && !document.querySelector('.nav-menu .login-btn').contains(e.target)) {
                    userMenu.style.display = 'none';
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 0);
    }
}

// Update UI for logged-out user
function updateUIForLoggedOutUser() {
    // Update navigation
    const navLoginBtn = document.querySelector('.nav-menu .login-btn');
    if (navLoginBtn) {
        navLoginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        navLoginBtn.href = 'login.html';
        navLoginBtn.onclick = null;
    }
    
    // Remove user menu if it exists
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        userMenu.remove();
    }
}

// Switch tab (for use from login.html)
function switchTab(tabName) {
    // Update active tab button
    document.querySelectorAll('.login-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === tabName + 'Tab') {
            content.classList.add('active');
        }
    });
    
    // Clear messages
    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.innerHTML = '';
    }
}

// Redirect based on user role
function redirectBasedOnRole(role) {
    let redirectUrl = 'login.html';
    
    switch (role) {
        case 'admin':
            redirectUrl = 'admin-dashboard.html';
            break;
        case 'teacher':
            redirectUrl = 'teacher-dashboard.html';
            break;
        case 'student':
            redirectUrl = 'student-dashboard.html';
            break;
        default:
            redirectUrl = 'index.html';
    }
    
    // Show message about redirection
    if (window.location.pathname.includes('login.html')) {
        showMessage(`Redirecting to ${role} dashboard...`, 'info');
    }
    
    // Redirect after delay
    setTimeout(() => {
        if (!window.location.pathname.includes(redirectUrl)) {
            window.location.href = redirectUrl;
        }
    }, 1500);
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize the application
function initApp() {
    console.log("Initializing NANA ACADEMY application...");
    
    // Check authentication state
    checkAuthState();
    
    // Set up login form if on login page
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const role = document.getElementById('loginRole').value;
            
            if (!email || !password || !role) {
                showMessage('Please fill in all fields.', 'error');
                return;
            }
            
            handleLogin(email, password, role);
        });
    }
    
    // Set up password reset form if on login page
    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value;
            const role = document.getElementById('resetRole').value;
            
            if (!email || !role) {
                showMessage('Please fill in all fields.', 'error');
                return;
            }
            
            handlePasswordReset(email, role);
        });
    }
    
    // Set up tab switching if on login page
    document.querySelectorAll('.login-tab, .forgot-password').forEach(element => {
        element.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
        });
    });
    
    // Set up password visibility toggles if on login page
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const passwordInput = document.getElementById(targetId);
            const icon = this.querySelector('i');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
    
    console.log("Application initialized successfully!");
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Export functions for use in HTML
window.showMessage = showMessage;
window.switchTab = switchTab;
window.handleLogout = handleLogout;
window.loadAdminDashboard = loadAdminDashboard;
window.addStudent = addStudent;
window.addTeacher = addTeacher;
window.addAnnouncement = addAnnouncement;
window.getAllStudents = getAllStudents;
window.getAllTeachers = getAllTeachers;