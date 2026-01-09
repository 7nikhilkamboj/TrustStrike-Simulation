package models

import (
	"testing"
)

func TestDeletionRestrictions(t *testing.T) {
	setupTest(t)

	// Check for existing admin user (ID 1)
	adminUser := User{}
	db.Where("id = ?", 1).First(&adminUser)
	if adminUser.Id == 0 {
		adminUser = User{Username: "admin_test", ApiKey: "admin_key", RoleID: 1}
		err := db.Save(&adminUser).Error
		if err != nil {
			t.Fatalf("Failed to save admin user: %v", err)
		}
		// Force ID 1 if auto-increment gave something else
		if adminUser.Id != 1 {
			db.Exec("UPDATE users SET id = 1 WHERE id = ?", adminUser.Id)
			adminUser.Id = 1
		}
	}

	// For standard user
	stdUser := User{Username: "user", ApiKey: "user_key", RoleID: 2}
	err := db.Save(&stdUser).Error
	if err != nil {
		t.Fatalf("Failed to save std user: %v", err)
	}

	// 1. SMTP Profile
	smtp := SMTP{Name: "Admin SMTP", UserId: adminUser.Id, Interface: "SMTP"}
	db.Save(&smtp)

	// Test: Std user deletes Admin SMTP -> SHOULD FAIL
	err = DeleteSMTP(smtp.Id, stdUser.Id)
	if err == nil {
		t.Error("Standard user was able to delete Admin SMTP profile")
	} else if err.Error() != "Only administrators can delete this resource. Please contact the admin." {
		t.Errorf("Unexpected error message: %v", err)
	}

	// Test: Admin user deletes Admin SMTP -> SHOULD PASS
	err = DeleteSMTP(smtp.Id, adminUser.Id)
	if err != nil {
		t.Errorf("Admin failed to delete own SMTP profile: %v", err)
	}

	// 2. SMS Profile
	sms := SMS{Name: "Admin SMS", UserId: adminUser.Id, InterfaceType: "SMS"}
	db.Save(&sms)

	err = DeleteSMS(sms.Id, stdUser.Id)
	if err == nil {
		t.Error("Standard user was able to delete Admin SMS profile")
	}

	err = DeleteSMS(sms.Id, adminUser.Id)
	if err != nil {
		t.Errorf("Admin failed to delete own SMS profile: %v", err)
	}

	// 3. Template
	tmpl := Template{Name: "Admin Tmpl", UserId: adminUser.Id}
	db.Save(&tmpl)

	err = DeleteTemplate(tmpl.Id, stdUser.Id)
	if err == nil {
		t.Error("Standard user was able to delete Admin Template")
	}

	err = DeleteTemplate(tmpl.Id, adminUser.Id)
	if err != nil {
		t.Errorf("Admin failed to delete own Template: %v", err)
	}

	// 4. Page
	page := Page{Name: "Admin Page", UserId: adminUser.Id}
	db.Save(&page)

	err = DeletePage(page.Id, stdUser.Id)
	if err == nil {
		t.Error("Standard user was able to delete Admin Page")
	}

	err = DeletePage(page.Id, adminUser.Id)
	if err != nil {
		t.Errorf("Admin failed to delete own Page: %v", err)
	}

	// 5. Group
	grp := Group{Name: "Admin Group", UserId: adminUser.Id}
	db.Save(&grp)

	err = DeleteGroup(grp.Id, stdUser.Id)
	if err == nil {
		t.Error("Standard user was able to delete Admin Group")
	}

	err = DeleteGroup(grp.Id, adminUser.Id)
	if err != nil {
		t.Errorf("Admin failed to delete own Group: %v", err)
	}
}
