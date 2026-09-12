const { sequelize } = require("../config/database");
const cloudinary = require("../config/cloudinary");

const {
  User,
  UserProfile,
  UserTarget,
} = require("../models");

const uploadToCloudinary = (
  fileBuffer,
  userId,
) => {
  return new Promise(
    (resolve, reject) => {
      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            folder: "matriq/profile",
            public_id:
              `user-${userId}-${Date.now()}`,
            resource_type: "image",

            transformation: [
              {
                width: 500,
                height: 500,
                crop: "fill",
                gravity: "face",
              },
              {
                quality: "auto",
                fetch_format: "auto",
              },
            ],
          },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            resolve(result);
          },
        );

      uploadStream.end(
        fileBuffer,
      );
    },
  );
};

function normalizePilihan(
  pilihan,
) {
  if (Array.isArray(pilihan)) {
    return pilihan;
  }

  if (
    pilihan === undefined ||
    pilihan === null ||
    pilihan === ""
  ) {
    return [];
  }

  if (typeof pilihan === "string") {
    const trimmed =
      pilihan.trim();

    if (!trimmed) {
      return [];
    }

    // kalau frontend kirim JSON array/string
    try {
      const parsed =
        JSON.parse(trimmed);

      if (
        Array.isArray(parsed)
      ) {
        return parsed;
      }

      return [parsed];
    } catch {
      // kalau FormData cuma kirim kode_snbt biasa
      return [trimmed];
    }
  }

  return [pilihan];
}

const completeOnboarding = async (
  req,
  res,
) => {
  const transaction =
    await sequelize.transaction();

  try {
    const userId =
      req.user.user_id;

    const {
      no_hp,
      gender,
      sekolah,
      kelas,
      tahun_lulus,
      provinsi,
      kota_kab,
      pilihan,
      target_score,
    } = req.body;

    if (
      !no_hp ||
      !gender ||
      !sekolah ||
      !kelas ||
      !tahun_lulus ||
      !provinsi ||
      !kota_kab
    ) {
      await transaction.rollback();

      return res
        .status(400)
        .json({
          success: false,
          message:
            "Data profil wajib belum lengkap",
        });
    }

    const normalizedPilihan =
      normalizePilihan(
        pilihan,
      );

    if (
      normalizedPilihan.length <
      1
    ) {
      await transaction.rollback();

      return res
        .status(400)
        .json({
          success: false,
          message:
            "Minimal pilih 1 target kampus/prodi",
        });
    }

    const user =
      await User.findByPk(
        userId,
        {
          transaction,
        },
      );

    if (!user) {
      await transaction.rollback();

      return res
        .status(404)
        .json({
          success: false,
          message:
            "User tidak ditemukan",
        });
    }

    let fotoProfile =
      user.foto_profile;

    if (req.file) {
      const uploadResult =
        await uploadToCloudinary(
          req.file.buffer,
          userId,
        );

      fotoProfile =
        uploadResult.secure_url;
    }

    // ==================================================
    // UPDATE USER
    // ==================================================

    await user.update(
      {
        no_hp,
        gender,
        foto_profile:
          fotoProfile,

        // PENTING:
        // onboarding sukses = user aktif
        is_activate: true,
      },
      {
        transaction,
      },
    );

    // ==================================================
    // USER PROFILE
    // ==================================================

    const profilePayload = {
      sekolah,
      kelas,
      tahun_lulus:
        Number(
          tahun_lulus,
        ),
      provinsi,
      kota_kab,
    };

    const existingProfile =
      await UserProfile.findOne(
        {
          where: {
            user_id: userId,
          },
          transaction,
        },
      );

    if (
      existingProfile
    ) {
      await existingProfile.update(
        profilePayload,
        {
          transaction,
        },
      );
    } else {
      await UserProfile.create(
        {
          user_id:
            userId,
          ...profilePayload,
        },
        {
          transaction,
        },
      );
    }

    // ==================================================
    // USER TARGET
    // ==================================================

    const parsedTargetScore =
      target_score === undefined ||
      target_score === null ||
      target_score === ""
        ? null
        : Number(
            target_score,
          );

    const targetPayload = {
      pilihan:
        normalizedPilihan,

      target_score:
        Number.isNaN(
          parsedTargetScore,
        )
          ? null
          : parsedTargetScore,
    };

    const existingTarget =
      await UserTarget.findOne(
        {
          where: {
            user_id: userId,
          },
          transaction,
        },
      );

    if (
      existingTarget
    ) {
      await existingTarget.update(
        targetPayload,
        {
          transaction,
        },
      );
    } else {
      await UserTarget.create(
        {
          user_id:
            userId,
          ...targetPayload,
        },
        {
          transaction,
        },
      );
    }

    await transaction.commit();

    const updatedUser =
      await User.findByPk(
        userId,
        {
          attributes: {
            exclude: [
              "password",
            ],
          },

          include: [
            {
              model:
                UserProfile,
              as: "profile",
            },
            {
              model:
                UserTarget,
              as: "target",
            },
          ],
        },
      );

    return res
      .status(200)
      .json({
        success: true,
        message:
          "Profil berhasil dilengkapi",
        data:
          updatedUser,
      });
  } catch (error) {
    if (
      !transaction.finished
    ) {
      await transaction.rollback();
    }

    console.error(
      "ONBOARDING ERROR:",
      error,
    );

    return res
      .status(500)
      .json({
        success: false,
        message:
          "Terjadi kesalahan pada server",
      });
  }
};

module.exports = {
  completeOnboarding,
};
