// core/database.js - 데이터베이스 관리 시스템
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  deleteField,
  collection, 
  getDocs,
  query,
  where,
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "../config/firebase.js";
import { APP_CONFIG, utils } from "../config/app-config.js";

export class DatabaseManager {
  constructor() {
    this.collections = APP_CONFIG.collections;
    console.log("DatabaseManager 초기화 완료");
  }

  // 과제 할당
  async assignTask(userId, date, taskConfig) {
    try {
      console.log('=== assignTask 호출 ===');
      console.log('userId:', userId);
      console.log('date:', date);
      console.log('taskConfig:', taskConfig);
      
      const docPath = `${this.collections.users}/${userId}/${this.collections.assignments}/${date}`;
      console.log('저장할 Firestore 경로:', docPath);
      
      const docRef = doc(db, docPath);
      
      const tasksArray = taskConfig.tasks || (Array.isArray(taskConfig) ? taskConfig : [taskConfig]);
      
      // 과제가 비어있으면 문서를 삭제
      if (!tasksArray || tasksArray.length === 0) {
        console.log('⚠️ 과제 배열이 비어있어서 문서를 삭제합니다');
        await deleteDoc(docRef);
        console.log(`과제 문서 삭제 완료: ${userId}/${date}`);
        return { success: true, data: null, message: "모든 과제가 삭제됨" };
      }

      const assignmentData = {
        assignedAt: Date.now(),
        assignedBy: "teacher",
        date: date,
        tasks: tasksArray,
        status: "assigned",
        ...taskConfig
      };

      console.log('저장할 과제 데이터:', assignmentData);
      
      await setDoc(docRef, assignmentData, { merge: true });
      console.log(`과제 할당 성공: ${userId}/${date}`, assignmentData);
      return { success: true, data: assignmentData };

    } catch (error) {
      console.error("과제 할당 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 과제 조회
  async getAssignment(userId, date) {
    try {
      console.log('=== getAssignment 호출 ===');
      console.log('userId:', userId);
      console.log('date:', date);
      
      const docPath = `${this.collections.users}/${userId}/${this.collections.assignments}/${date}`;
      console.log('Firestore 경로:', docPath);
      
      const docRef = doc(db, docPath);
      const docSnap = await getDoc(docRef);
      
      console.log('문서 존재 여부:', docSnap.exists());

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('✅ 조회된 과제 데이터:', data);
        console.log('  - assignedAt:', data.assignedAt);
        console.log('  - assignedBy:', data.assignedBy);
        console.log('  - date:', data.date);
        console.log('  - tasks 타입:', typeof data.tasks);
        console.log('  - tasks 내용:', data.tasks);
        
        if (data.tasks) {
          if (Array.isArray(data.tasks)) {
            console.log('  - tasks 배열 길이:', data.tasks.length);
            data.tasks.forEach((task, index) => {
              console.log(`    [${index}] taskId: ${task.taskId}, type: ${task.type}`);
            });
          } else {
            console.log('  - tasks 객체 키:', Object.keys(data.tasks));
          }
        } else {
          console.log('  - ⚠️ tasks 속성이 없음');
        }
        
        return { success: true, data: data };
      } else {
        console.log('❌ 과제가 없습니다 - 문서가 존재하지 않음');
        return { success: false, message: "과제가 없습니다" };
      }

    } catch (error) {
      console.error("과제 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 제출 기록 저장 (과제 ID 기반)
  async submitTask(userId, taskId, moduleId, submissionData) {
    try {
      console.log('=== submitTask 호출 (새 방식) ===');
      console.log('userId:', userId);
      console.log('taskId:', taskId);
      console.log('moduleId:', moduleId);
      console.log('submissionData:', submissionData);
      
      // 과제 ID가 있으면 과제 ID 기반 저장, 없으면 날짜 기반 저장 (하위 호환)
      const docId = taskId || submissionData.date;
      const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${docId}`);
      
      const submission = {
        [`${moduleId}`]: {
          ...submissionData,
          submittedAt: Date.now(),
          moduleId: moduleId,
          taskId: taskId || null
        },
        lastUpdated: Date.now(),
        taskId: taskId || null
      };

      await setDoc(docRef, submission, { merge: true });
      console.log(`✅ 제출 기록 저장 성공: ${userId}/${docId}/${moduleId}`, submission);
      return { success: true, data: submission };

    } catch (error) {
      console.error("제출 기록 저장 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 제출 기록 조회
  async getSubmissions(userId, date) {
    try {
      const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${date}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return { success: true, data: docSnap.data() };
      } else {
        return { success: false, message: "제출 기록이 없습니다" };
      }

    } catch (error) {
      console.error("제출 기록 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 특정 모듈의 완료 기록 조회
  // 과제 ID 기반 완료 상태 조회
  async getCompletionByTaskId(userId, taskId, moduleType) {
    try {
      console.log('=== getCompletionByTaskId 호출 ===');
      console.log('userId:', userId);
      console.log('taskId:', taskId);
      console.log('moduleType:', moduleType);
      
      const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${taskId}`);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('✅ 과제 ID 기반 제출 데이터 발견:', data);
        
        if (data[moduleType]) {
          console.log('✅ 해당 모듈 완료 데이터:', data[moduleType]);
          return { success: true, data: data[moduleType] };
        }
      }
      
      console.log('❌ 완료 기록 없음');
      return { success: false, message: `${moduleType} 완료 기록이 없습니다` };
      
    } catch (error) {
      console.error("완료 기록 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 기존 날짜 기반 완료 상태 조회 (하위 호환성)
  async getCompletion(userId, date, moduleType) {
    try {
      const submissionResult = await this.getSubmissions(userId, date);
      
      if (!submissionResult.success) {
        return { success: false, message: "제출 기록이 없습니다" };
      }

      const submissions = submissionResult.data;
      
      // 해당 모듈 타입의 데이터가 있는지 확인
      if (submissions[moduleType]) {
        return { success: true, data: submissions[moduleType] };
      } else {
        return { success: false, message: `${moduleType} 완료 기록이 없습니다` };
      }

    } catch (error) {
      console.error("완료 기록 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 특정 과제의 완료 상태 삭제
  async clearTaskCompletionStatus(userId, date, taskType) {
    try {
      const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${date}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data[taskType]) {
          // 해당 task type 필드 삭제
          await updateDoc(docRef, {
            [taskType]: deleteField()
          });
          console.log(`${taskType} 완료 상태 삭제 완료: ${date}`);
          return { success: true, message: "완료 상태가 삭제되었습니다" };
        } else {
          return { success: true, message: "삭제할 완료 상태가 없습니다" };
        }
      } else {
        return { success: true, message: "제출 기록이 없습니다" };
      }

    } catch (error) {
      console.error("완료 상태 삭제 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 로스터(학생 목록) 조회
  async getRoster() {
    try {
      const querySnapshot = await getDocs(collection(db, this.collections.roster));
      const roster = [];

      querySnapshot.forEach((doc) => {
        const studentData = {
          uid: doc.id,
          ...doc.data()
        };
        console.log('로스터에서 로드된 학생:', studentData);
        console.log('  - 문서 ID (UID):', doc.id);
        console.log('  - UID 길이:', doc.id.length);
        roster.push(studentData);
      });

      // 이름 순으로 정렬
      roster.sort((a, b) => {
        const aName = a.displayName || a.email || a.uid;
        const bName = b.displayName || b.email || b.uid;
        return aName.localeCompare(bName);
      });

      console.log(`로스터 조회 성공: ${roster.length}명`);
      return { success: true, data: roster };

    } catch (error) {
      console.error("로스터 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 로스터에 학생 추가
  async addStudent(studentData) {
    try {
      console.log('✅ database.js addStudent 호출됨:', studentData);
      const { uid, email, displayName, createdAt, createdBy } = studentData;
      console.log('✅ database.js에서 추출한 UID:', uid);
      console.log('✅ database.js에서 추출한 UID 길이:', uid?.length);
      
      const docRef = doc(db, this.collections.roster, uid);
      console.log('✅ 생성될 문서 경로:', `${this.collections.roster}/${uid}`);
      
      const data = {
        email: email || "",
        displayName: displayName || "",
        createdAt: createdAt || Date.now(),
        createdBy: createdBy || "",
        active: true
      };

      await setDoc(docRef, data, { merge: true });
      console.log(`✅ 학생 추가 성공: ${uid} (길이: ${uid?.length})`, data);
      return { success: true, data };

    } catch (error) {
      console.error("학생 추가 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 학생 삭제 (roster에서만 제거)
  async removeStudent(uid) {
    try {
      const docRef = doc(db, this.collections.roster, uid);
      await deleteDoc(docRef);
      
      console.log(`학생 삭제 성공: ${uid}`);
      return { success: true, message: "학생이 삭제되었습니다" };

    } catch (error) {
      console.error("학생 삭제 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 특정 날짜의 모든 제출 기록 조회 (교사용)
  async getAllSubmissions(date) {
    try {
      const rosterResult = await this.getRoster();
      if (!rosterResult.success) {
        return rosterResult;
      }

      const allSubmissions = [];
      
      for (const student of rosterResult.data) {
        const submissionResult = await this.getSubmissions(student.uid, date);
        
        if (submissionResult.success) {
          allSubmissions.push({
            student: student,
            submissions: submissionResult.data,
            hasSubmission: true
          });
        } else {
          allSubmissions.push({
            student: student,
            submissions: null,
            hasSubmission: false
          });
        }
      }

      return { success: true, data: allSubmissions };

    } catch (error) {
      console.error("전체 제출 기록 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 대량 과제 할당 (반복 배정)
  async bulkAssignTasks(userId, assignments) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const assignment of assignments) {
      const result = await this.assignTask(userId, assignment.date, assignment.taskConfig);
      
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({
          date: assignment.date,
          error: result.error
        });
      }
    }

    console.log(`대량 과제 할당 완료: 성공 ${results.success}, 실패 ${results.failed}`);
    return results;
  }

  // 과제 완료 상태 확인
  async checkTaskCompletion(userId, date, moduleIds) {
    try {
      const submissionResult = await this.getSubmissions(userId, date);
      
      if (!submissionResult.success) {
        return { success: true, completion: {} };
      }

      const submissions = submissionResult.data;
      const completion = {};

      moduleIds.forEach(moduleId => {
        completion[moduleId] = {
          completed: !!submissions[moduleId],
          data: submissions[moduleId] || null
        };
      });

      return { success: true, completion };

    } catch (error) {
      console.error("과제 완료 상태 확인 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 모든 과제 삭제 (특정 타입)
  async clearAllAssignments(userId, taskType = null) {
    try {
      console.log(`모든 과제 삭제 시작: ${userId}, 타입: ${taskType}`);
      
      // 현재 날짜부터 미래 30일까지 삭제
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);
      
      let deletedCount = 0;
      
      for (let date = new Date(today); date <= futureDate; date.setDate(date.getDate() + 1)) {
        const dateKey = utils.formatDateKey(date);
        
        try {
          const assignmentResult = await this.getAssignment(userId, dateKey);
          
          if (assignmentResult.success && assignmentResult.data.tasks) {
            let tasks = assignmentResult.data.tasks;
            
            if (taskType) {
              // 특정 타입만 제거
              const filteredTasks = tasks.filter(task => task.type !== taskType);
              
              if (filteredTasks.length !== tasks.length) {
                if (filteredTasks.length === 0) {
                  // 모든 과제가 제거되면 문서 삭제
                  const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.assignments}/${dateKey}`);
                  await deleteDoc(docRef);
                } else {
                  // 일부 과제만 제거
                  await this.assignTask(userId, dateKey, { tasks: filteredTasks });
                }
                deletedCount++;
              }
            } else {
              // 모든 과제 삭제
              const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.assignments}/${dateKey}`);
              await deleteDoc(docRef);
              deletedCount++;
            }
          }
        } catch (error) {
          console.error(`${dateKey} 과제 삭제 오류:`, error);
        }
      }
      
      console.log(`과제 삭제 완료: ${deletedCount}개 날짜 처리`);
      return { success: true, deletedCount };
      
    } catch (error) {
      console.error("모든 과제 삭제 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 과제 제출 확인 처리
  async markTaskAsConfirmed(userId, date, taskType) {
    try {
      console.log(`과제 확인 처리: ${userId}/${date}/${taskType}`);
      
      const assignmentResult = await this.getAssignment(userId, date);
      
      if (!assignmentResult.success || !assignmentResult.data.tasks) {
        return { success: false, error: "해당 날짜에 과제가 없습니다" };
      }
      
      // 해당 타입의 과제만 제거
      const filteredTasks = assignmentResult.data.tasks.filter(task => task.type !== taskType);
      
      if (filteredTasks.length === 0) {
        // 모든 과제가 제거되면 문서 삭제
        const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.assignments}/${date}`);
        await deleteDoc(docRef);
      } else {
        // 일부 과제만 제거
        await this.assignTask(userId, date, { tasks: filteredTasks });
      }
      
      console.log(`과제 확인 완료: ${taskType} 과제 제거됨`);
      return { success: true };
      
    } catch (error) {
      console.error("과제 확인 처리 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 특정 과제 ID의 제출 데이터 조회 (학생 완료 상태 확인용)
  async getSubmissionByTaskId(userId, taskId) {
    try {
      console.log('🔍 과제 ID 기반 제출 데이터 조회:', { userId, taskId });
      console.log('🔍 조회 경로:', `users/${userId}/submissions/${taskId}`);
      
      // users/{userId}/submissions/{taskId} 문서에서 조회 (실제 저장 구조와 일치)
      const docRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${taskId}`);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        console.log(`📝 과제 ${taskId} 제출 데이터 없음 (미완료 상태)`);
        return { success: true, data: null };
      }
      
      const submissionDoc = docSnap.data();
      console.log('📊 조회된 제출 문서:', submissionDoc);
      
      // 문서 내에서 모듈별 제출 데이터 확인 (dictation, reading 등)
      const moduleSubmissions = [];
      Object.keys(submissionDoc).forEach(key => {
        if (key !== 'lastUpdated' && key !== 'taskId' && submissionDoc[key].submittedAt) {
          moduleSubmissions.push({
            moduleId: key,
            ...submissionDoc[key]
          });
        }
      });
      
      if (moduleSubmissions.length === 0) {
        console.log(`📝 과제 ${taskId}에 유효한 제출 데이터 없음`);
        return { success: true, data: null };
      }
      
      // 가장 최근 제출 데이터 반환
      const latestSubmission = moduleSubmissions.reduce((latest, current) => {
        return current.submittedAt > latest.submittedAt ? current : latest;
      });
      
      console.log('✅ 과제 제출 데이터 발견:', {
        taskId: taskId,
        moduleId: latestSubmission.moduleId,
        submittedAt: new Date(latestSubmission.submittedAt).toLocaleString(),
        score: latestSubmission.score
      });
      
      return { success: true, data: latestSubmission };
      
    } catch (error) {
      console.error("과제 제출 데이터 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 사용자의 모든 제출 현황 조회 (디버깅용 - 정확한 데이터 구조 확인)
  async getAllSubmissionsByUser(userId) {
    try {
      console.log('🔍 === 사용자 제출 데이터 전체 조사 시작 ===');
      console.log('사용자 ID:', userId);
      
      // users/{userId}/submissions 컬렉션의 모든 문서 조회
      const submissionsRef = collection(db, `${this.collections.users}/${userId}/${this.collections.submissions}`);
      const querySnapshot = await getDocs(submissionsRef);
      
      if (querySnapshot.empty) {
        console.log('❌ 제출 데이터가 전혀 없음');
        return { success: true, data: [], message: '제출 데이터 없음' };
      }
      
      const submissions = [];
      console.log(`📊 총 ${querySnapshot.size}개의 제출 문서 발견`);
      
      querySnapshot.forEach((doc) => {
        const docData = doc.data();
        console.log(`📄 문서 ID: ${doc.id}`);
        console.log(`📄 문서 내용:`, docData);
        
        // 문서 내 모든 모듈 데이터 분석
        Object.keys(docData).forEach(key => {
          if (key !== 'lastUpdated' && key !== 'taskId') {
            console.log(`  📋 모듈 ${key}:`, docData[key]);
            if (docData[key].submittedAt) {
              console.log(`    ✅ 제출시간: ${new Date(docData[key].submittedAt).toLocaleString()}`);
              console.log(`    🎯 과제ID: ${docData[key].taskId || '없음'}`);
              console.log(`    📊 점수: ${docData[key].score || '없음'}`);
            }
          }
        });
        
        submissions.push({ 
          documentId: doc.id,
          ...docData 
        });
      });
      
      console.log('🔍 === 사용자 제출 데이터 조사 완료 ===');
      return { success: true, data: submissions };
      
    } catch (error) {
      console.error("❌ 사용자 제출 현황 조회 실패:", error);
      return { success: false, error: error.message };
    }
  }

  // 과제 및 관련 제출 데이터 완전 삭제 (Cascade Delete)
  async cascadeDeleteTask(userId, taskId) {
    console.log('🗑️ === 과제 및 관련 데이터 완전 삭제 시작 ===');
    console.log('사용자 ID:', userId);
    console.log('과제 ID:', taskId);
    
    const results = {
      assignmentDeleted: false,
      submissionDeleted: false,
      storageFilesDeleted: 0,
      errors: []
    };

    try {
      // 1. 제출 데이터에서 Storage 이미지 URL들 수집
      const submissionRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${taskId}`);
      const submissionSnap = await getDoc(submissionRef);
      
      const imageUrls = [];
      if (submissionSnap.exists()) {
        const submissionData = submissionSnap.data();
        console.log('📄 제출 데이터 발견:', submissionData);
        
        // 모든 모듈의 imageUrl 수집
        Object.keys(submissionData).forEach(key => {
          if (key !== 'lastUpdated' && key !== 'taskId' && submissionData[key] && submissionData[key].imageUrl) {
            imageUrls.push(submissionData[key].imageUrl);
            console.log('🖼️ 삭제할 이미지 URL 발견:', submissionData[key].imageUrl);
          }
        });
      }

      // 2. Firebase Storage 이미지 삭제는 무료 플랜 제한으로 스킵
      // 대신 이미지 URL 정보만 기록하고 Firestore 데이터만 삭제
      if (imageUrls.length > 0) {
        console.log('📸 무료 플랜으로 인해 Storage 이미지는 보존됩니다:', imageUrls);
        console.log('⚠️ 주의: Firebase Storage 파일은 수동으로 관리해야 합니다.');
        results.errors.push(`Storage 이미지 ${imageUrls.length}개는 무료 플랜 제한으로 보존됨`);
      }

      // 3. Firestore 제출 데이터 삭제
      if (submissionSnap.exists()) {
        await deleteDoc(submissionRef);
        results.submissionDeleted = true;
        console.log('🗑️ Firestore 제출 데이터 삭제 완료');
      }

      // 4. 과제 할당에서 해당 과제 제거 (날짜 기반으로 찾아서 삭제)
      const dateKey = this.extractDateFromTaskId(taskId);
      const assignmentRef = doc(db, `${this.collections.users}/${userId}/${this.collections.assignments}/${dateKey}`);
      const assignmentSnap = await getDoc(assignmentRef);
      
      if (assignmentSnap.exists()) {
        const assignmentData = assignmentSnap.data();
        if (assignmentData.tasks && Array.isArray(assignmentData.tasks)) {
          const filteredTasks = assignmentData.tasks.filter(task => task.taskId !== taskId);
          
          if (filteredTasks.length === 0) {
            // 모든 과제가 제거되면 문서 삭제
            await deleteDoc(assignmentRef);
            console.log('🗑️ 과제 할당 문서 완전 삭제');
          } else {
            // 일부 과제만 제거
            await updateDoc(assignmentRef, { tasks: filteredTasks });
            console.log('🗑️ 과제 할당에서 해당 과제만 제거');
          }
          results.assignmentDeleted = true;
        }
      }

      console.log('✅ 과제 완전 삭제 완료:', results);
      return { success: true, results };

    } catch (error) {
      console.error('❌ 과제 완전 삭제 실패:', error);
      results.errors.push(`전체 삭제 실패: ${error.message}`);
      return { success: false, error: error.message, results };
    }
  }

  // 과제 ID에서 날짜 추출 (utils.js와 동일한 로직)
  extractDateFromTaskId(taskId) {
    if (!taskId || typeof taskId !== 'string') {
      return null;
    }
    return taskId.split('_')[0];
  }

  // 무료 플랜 호환: Firestore 데이터만 삭제 (Storage는 보존)
  async deleteFirestoreDataOnly(userId, taskId) {
    console.log('🗑️ === Firestore 데이터만 삭제 시작 (무료 플랜 호환) ===');
    console.log('사용자 ID:', userId);
    console.log('과제 ID:', taskId);
    
    const results = {
      assignmentDeleted: false,
      submissionDeleted: false,
      storageNote: '',
      errors: []
    };

    try {
      // 1. Firestore 제출 데이터 삭제
      const submissionRef = doc(db, `${this.collections.users}/${userId}/${this.collections.submissions}/${taskId}`);
      const submissionSnap = await getDoc(submissionRef);
      
      if (submissionSnap.exists()) {
        const submissionData = submissionSnap.data();
        console.log('📄 삭제할 제출 데이터:', submissionData);
        
        // 이미지 URL이 있다면 기록만 남기기
        let imageCount = 0;
        Object.keys(submissionData).forEach(key => {
          if (key !== 'lastUpdated' && key !== 'taskId' && submissionData[key] && submissionData[key].imageUrl) {
            imageCount++;
          }
        });
        
        if (imageCount > 0) {
          results.storageNote = `Storage 이미지 ${imageCount}개는 무료 플랜 제한으로 보존됨`;
        }
        
        await deleteDoc(submissionRef);
        results.submissionDeleted = true;
        console.log('🗑️ Firestore 제출 데이터 삭제 완료');
      }

      // 2. 과제 할당에서 해당 과제 제거
      const dateKey = this.extractDateFromTaskId(taskId);
      const assignmentRef = doc(db, `${this.collections.users}/${userId}/${this.collections.assignments}/${dateKey}`);
      const assignmentSnap = await getDoc(assignmentRef);
      
      if (assignmentSnap.exists()) {
        const assignmentData = assignmentSnap.data();
        if (assignmentData.tasks && Array.isArray(assignmentData.tasks)) {
          const filteredTasks = assignmentData.tasks.filter(task => task.taskId !== taskId);
          
          if (filteredTasks.length === 0) {
            await deleteDoc(assignmentRef);
            console.log('🗑️ 과제 할당 문서 완전 삭제');
          } else {
            await updateDoc(assignmentRef, { tasks: filteredTasks });
            console.log('🗑️ 과제 할당에서 해당 과제만 제거');
          }
          results.assignmentDeleted = true;
        }
      }

      // 3. 해당 과제의 localStorage 캐시도 모두 삭제 (학생 콘솔 완료 상태 초기화)
      console.log('🧹 localStorage 캐시 정리 중...');
      
      // 브라우저의 모든 localStorage 키를 검사해서 해당 과제 관련 캐시 삭제
      const keysToRemove = [];
      
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.includes(`_${userId}_${taskId}`) ||
            key.includes(`${userId}_${taskId}`) ||
            key.includes(`${taskId}`)
          )) {
            keysToRemove.push(key);
          }
        }
        
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
          console.log('🗑️ localStorage 캐시 삭제:', key);
        });
        
        if (keysToRemove.length > 0) {
          results.cacheCleared = keysToRemove.length;
          console.log(`✅ localStorage 캐시 ${keysToRemove.length}개 정리 완료`);
        } else {
          console.log('💾 정리할 캐시 없음');
        }
        
      } catch (cacheError) {
        console.error('⚠️ 캐시 정리 실패 (무시 가능):', cacheError);
        results.errors.push(`캐시 정리 실패: ${cacheError.message}`);
      }

      console.log('✅ Firestore 데이터 삭제 완료:', results);
      return { success: true, results };

    } catch (error) {
      console.error('❌ Firestore 데이터 삭제 실패:', error);
      results.errors.push(`Firestore 삭제 실패: ${error.message}`);
      return { success: false, error: error.message, results };
    }
  }
}

// 전역 DatabaseManager 인스턴스
export const dbManager = new DatabaseManager();